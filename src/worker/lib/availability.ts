import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { ACTIVE_BOOKING_STATUSES } from "../../shared/constants";
import type { Settings } from "../../shared/settings";
import { computeSlots, type BusyInterval, type DateException, type Slot } from "../../shared/slots";
import { addDays, toIso, zonedToUtc } from "../../shared/time";
import type { Db } from "../db/client";
import {
	availabilityExceptions,
	availabilityRules,
	bookings,
	counselorRooms,
	counselors,
	roomHours,
	rooms,
} from "../db/schema";

// 占用時段的預約：有效狀態，且排除已過保留期限的未驗證預約
export const occupyingBooking = (nowIso: string) =>
	and(
		inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
		or(
			sql`${bookings.status} <> 'unverified'`,
			sql`${bookings.holdExpiresAt} IS NULL`,
			gt(bookings.holdExpiresAt, nowIso),
		),
	);

const toException = (e: typeof availabilityExceptions.$inferSelect): DateException => ({
	date: e.date,
	startTime: e.startTime,
	endTime: e.endTime,
	kind: e.kind,
});

export interface AvailabilityQuery {
	counselorId: string;
	from: string;
	to: string;
	now: number;
	// 排除指定預約（例如重新檢查自己）
	excludeBookingId?: string;
}

// 心理師不存在或已停用時回傳 null
export async function loadSlots(db: Db, settings: Settings, q: AvailabilityQuery): Promise<Slot[] | null> {
	const tz = settings.timezone;
	const [counselor] = await db
		.select({ id: counselors.id })
		.from(counselors)
		.where(and(eq(counselors.id, q.counselorId), eq(counselors.isActive, true)));
	if (!counselor) return null;

	const links = await db
		.select({ roomId: counselorRooms.roomId })
		.from(counselorRooms)
		.where(eq(counselorRooms.counselorId, q.counselorId));
	// 未綁定任何空間時，可使用全部啟用中的空間
	const roomList = await db
		.select({ id: rooms.id })
		.from(rooms)
		.where(
			links.length
				? and(eq(rooms.isActive, true), inArray(rooms.id, links.map((l) => l.roomId)))
				: eq(rooms.isActive, true),
		)
		.orderBy(asc(rooms.sortOrder), asc(rooms.name));
	const roomIds = roomList.map((r) => r.id);

	const rangeStart = toIso(zonedToUtc(q.from, 0, tz));
	const rangeEnd = toIso(zonedToUtc(addDays(q.to, 1), 0, tz));
	const nowIso = toIso(q.now);

	const [rules, exceptions, hours, busy] = await Promise.all([
		db.select().from(availabilityRules).where(eq(availabilityRules.counselorId, q.counselorId)),
		db
			.select()
			.from(availabilityExceptions)
			.where(
				and(
					sql`${availabilityExceptions.date} BETWEEN ${q.from} AND ${q.to}`,
					or(
						eq(availabilityExceptions.counselorId, q.counselorId),
						roomIds.length ? inArray(availabilityExceptions.roomId, roomIds) : sql`0`,
					),
				),
			),
		roomIds.length ? db.select().from(roomHours).where(inArray(roomHours.roomId, roomIds)) : [],
		db
			.select({
				id: bookings.id,
				counselorId: bookings.counselorId,
				roomId: bookings.roomId,
				startAt: bookings.startAt,
				endAt: bookings.endAt,
			})
			.from(bookings)
			.where(
				and(
					occupyingBooking(nowIso),
					lt(bookings.startAt, rangeEnd),
					gt(bookings.endAt, rangeStart),
					or(
						eq(bookings.counselorId, q.counselorId),
						roomIds.length ? inArray(bookings.roomId, roomIds) : sql`0`,
					),
				),
			),
	]);

	const relevant = busy.filter((b) => b.id !== q.excludeBookingId);
	const interval = (b: (typeof relevant)[number]): BusyInterval => ({ startAt: b.startAt, endAt: b.endAt });

	return computeSlots({
		timezone: tz,
		slotDurationMinutes: settings.slotDurationMinutes,
		slotIntervalMinutes: settings.slotIntervalMinutes,
		minLeadHours: settings.minLeadHours,
		maxAdvanceDays: settings.maxAdvanceDays,
		now: q.now,
		from: q.from,
		to: q.to,
		counselor: {
			rules,
			exceptions: exceptions.filter((e) => e.counselorId === q.counselorId).map(toException),
			busy: relevant.filter((b) => b.counselorId === q.counselorId).map(interval),
		},
		rooms: roomIds.map((id) => ({
			id,
			hours: hours.filter((h) => h.roomId === id),
			exceptions: exceptions.filter((e) => e.roomId === id).map(toException),
			busy: relevant.filter((b) => b.roomId === id).map(interval),
		})),
	});
}

