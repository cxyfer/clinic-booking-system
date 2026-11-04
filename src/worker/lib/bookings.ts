import { and, eq, getTableColumns, lt, lte, sql } from "drizzle-orm";
import { ACTIVE_BOOKING_STATUSES, type BookingStatus } from "../../shared/constants";
import type { BookingDto } from "../../shared/api";
import type { Settings } from "../../shared/settings";
import { toIso, wallClock } from "../../shared/time";
import type { Db } from "../db/client";
import { bookings, counselors, notifications, rooms } from "../db/schema";
import { emailNotification, webhookNotification } from "../notify/outbox";
import type { BookingSnapshot, ClientPayload } from "../notify/templates";
import { loadSlots } from "./availability";
import { newId, randomToken, sha256Hex } from "./tokens";

type Booking = typeof bookings.$inferSelect;
type NewNotification = typeof notifications.$inferInsert;

export type BookingError =
	| "counselor_not_found"
	| "slot_unavailable"
	| "slot_taken"
	| "not_found"
	| "invalid_status"
	| "hold_expired"
	| "too_late_to_cancel";

export type Result<T> = { ok: true; value: T } | { ok: false; error: BookingError };
const fail = (error: BookingError) => ({ ok: false as const, error });

interface Ctx {
	env: Env;
	db: Db;
	settings: Settings;
	now: number;
}

// ── 查詢 ────────────────────────────────────────────────

async function findByToken(db: Db, token: string) {
	const hash = await sha256Hex(token);
	const [row] = await db
		.select({
			booking: bookings,
			counselorName: counselors.name,
			counselorEmail: counselors.email,
			roomName: rooms.name,
		})
		.from(bookings)
		.innerJoin(counselors, eq(bookings.counselorId, counselors.id))
		.innerJoin(rooms, eq(bookings.roomId, rooms.id))
		.where(eq(bookings.manageTokenHash, hash));
	return row ?? null;
}
type Found = NonNullable<Awaited<ReturnType<typeof findByToken>>>;

const holdExpired = (b: Booking, now: number) =>
	b.status === "unverified" && b.holdExpiresAt != null && Date.parse(b.holdExpiresAt) <= now;

// 個案可自行取消的期限；未驗證的預約隨時可取消
function cancelDeadline(b: Booking, settings: Settings): number | null {
	if (b.status === "unverified") return null;
	return Date.parse(b.startAt) - settings.clientCancelCutoffHours * 3_600_000;
}

function canCancel(b: Booking, settings: Settings, now: number) {
	if (!["unverified", "pending", "confirmed"].includes(b.status) || holdExpired(b, now)) return false;
	const deadline = cancelDeadline(b, settings);
	return deadline == null || now < deadline;
}

export function toDto(found: Found, settings: Settings, now: number): BookingDto {
	const b = found.booking;
	const deadline = cancelDeadline(b, settings);
	return {
		id: b.id,
		// 已過保留期限但 cron 尚未處理的預約，對外視為 expired
		status: holdExpired(b, now) ? "expired" : b.status,
		startAt: b.startAt,
		endAt: b.endAt,
		counselor: { id: b.counselorId, name: found.counselorName },
		room: { id: b.roomId, name: found.roomName },
		clientName: b.clientName,
		holdExpiresAt: b.status === "unverified" ? b.holdExpiresAt : null,
		cancelDeadline: deadline == null ? null : toIso(deadline),
		canCancel: canCancel(b, settings, now),
		icsSequence: b.icsSequence,
	};
}

export async function lookupBooking(ctx: Ctx, token: string): Promise<Result<BookingDto>> {
	const found = await findByToken(ctx.db, token);
	return found ? { ok: true, value: toDto(found, ctx.settings, ctx.now) } : fail("not_found");
}

// ── 通知內容 ────────────────────────────────────────────

function snapshot(ctx: Ctx, b: Booking, counselorName: string, roomName: string): BookingSnapshot {
	return {
		bookingId: b.id,
		counselorName,
		roomName,
		startAt: b.startAt,
		endAt: b.endAt,
		icsSequence: b.icsSequence,
		timezone: ctx.settings.timezone,
		clinicName: ctx.settings.clinicName,
		clinicAddress: ctx.settings.clinicAddress,
		contactInfo: ctx.settings.contactInfo,
		adminUrl: `${ctx.env.APP_URL}/admin`,
	};
}

// token 放在 # 之後，不會出現在伺服器的請求紀錄
export const manageUrl = (env: Env, token: string) => `${env.APP_URL}/booking#t=${token}`;

// 依預約進入的狀態決定要寄哪些通知
function notificationsFor(
	ctx: Ctx,
	b: Booking,
	names: { counselorName: string; counselorEmail: string; roomName: string },
	event: "created" | "verified" | "cancelled" | "expired",
	token?: string,
): NewNotification[] {
	const snap = snapshot(ctx, b, names.counselorName, names.roomName);
	const client: ClientPayload = {
		...snap,
		clientName: b.clientName,
		manageUrl: token ? manageUrl(ctx.env, token) : "",
		holdMinutes: ctx.settings.verificationHoldMinutes,
		cancelCutoffHours: ctx.settings.clientCancelCutoffHours,
	};
	const hook = (type: string) =>
		webhookNotification(
			ctx.env,
			b.id,
			type,
			{
				bookingId: b.id,
				counselorId: b.counselorId,
				roomId: b.roomId,
				startAt: b.startAt,
				endAt: b.endAt,
				status: b.status,
			},
			ctx.now,
		);

	switch (event) {
		case "created":
		case "verified":
			if (b.status === "unverified") return [emailNotification(b.id, "client.verify", b.clientEmail, client)];
			if (b.status === "pending")
				return [
					emailNotification(b.id, "client.received", b.clientEmail, client),
					emailNotification(b.id, "counselor.pending", names.counselorEmail, snap),
					...hook("booking.created"),
				];
			return [
				emailNotification(b.id, "client.confirmed", b.clientEmail, client),
				emailNotification(b.id, "counselor.confirmed", names.counselorEmail, snap),
				...hook("booking.created"),
			];
		case "cancelled":
			return [
				emailNotification(b.id, "client.cancelled", b.clientEmail, client),
				emailNotification(b.id, "counselor.cancelled", names.counselorEmail, snap),
				...hook("booking.cancelled"),
			];
		case "expired":
			return [emailNotification(b.id, "client.expired", b.clientEmail, client), ...hook("booking.expired")];
	}
}

// 只有在預約確實更新為指定狀態時才寫入通知（與狀態更新在同一個 batch）
function insertIfTransitioned(d1: D1Database, row: NewNotification, bookingId: string, status: BookingStatus, updatedAt: string) {
	return d1
		.prepare(
			`INSERT INTO notifications (id, booking_id, channel, recipient, template, payload)
			 SELECT ?, ?, ?, ?, ?, ?
			 WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND status = ? AND updated_at = ?)`,
		)
		.bind(row.id, row.bookingId, row.channel, row.recipient, row.template, JSON.stringify(row.payload), bookingId, status, updatedAt);
}

// drizzle 的 batch 不接受原生 SQL，這裡直接用 D1 batch（同樣具交易性）
async function transition(
	ctx: Ctx,
	found: Found,
	from: BookingStatus,
	patch: Partial<typeof bookings.$inferInsert> & { status: BookingStatus },
	buildNotifications: (next: Booking) => NewNotification[],
): Promise<{ booking: Booking; notificationIds: string[] } | null> {
	const updatedAt = toIso(ctx.now);
	const next = { ...found.booking, ...patch, updatedAt } as Booking;
	const rows = buildNotifications(next);
	const d1 = ctx.env.DB;

	const update = ctx.db
		.update(bookings)
		.set({ ...patch, updatedAt })
		.where(and(eq(bookings.id, found.booking.id), eq(bookings.status, from)))
		.toSQL();
	const [result] = await d1.batch([
		d1.prepare(update.sql).bind(...update.params),
		...rows.map((r) => insertIfTransitioned(d1, r, found.booking.id, patch.status, updatedAt)),
	]);
	if (!result?.meta.changes) return null;
	return { booking: next, notificationIds: rows.map((r) => r.id!) };
}

// ── 建立 ────────────────────────────────────────────────

export interface CreateInput {
	counselorId: string;
	roomId: string;
	startAt: string;
	clientName: string;
	clientEmail: string;
	clientPhone?: string;
}

export interface Created {
	booking: BookingDto;
	token: string;
	notificationIds: string[];
}

export async function createBooking(ctx: Ctx, input: CreateInput): Promise<Result<Created>> {
	const { db, settings, now } = ctx;
	const date = wallClock(Date.parse(input.startAt), settings.timezone).date;
	const slots = await loadSlots(db, settings, { counselorId: input.counselorId, from: date, to: date, now });
	if (!slots) return fail("counselor_not_found");

	const slot = slots.find((s) => s.startAt === new Date(input.startAt).toISOString());
	if (!slot || !slot.roomIds.includes(input.roomId)) return fail("slot_unavailable");

	const [names] = await db
		.select({ counselorName: counselors.name, counselorEmail: counselors.email, roomName: rooms.name })
		.from(counselors)
		.innerJoin(rooms, eq(rooms.id, input.roomId))
		.where(eq(counselors.id, input.counselorId));
	if (!names) return fail("slot_unavailable");

	const token = randomToken();
	const nowIso = toIso(now);
	const status: BookingStatus = settings.requireEmailVerification
		? "unverified"
		: settings.confirmationMode === "auto"
			? "confirmed"
			: "pending";

	const booking: Booking = {
		id: newId("bk"),
		counselorId: input.counselorId,
		roomId: input.roomId,
		startAt: slot.startAt,
		endAt: slot.endAt,
		status,
		clientName: input.clientName,
		clientEmail: input.clientEmail,
		clientPhone: input.clientPhone ?? null,
		staffNote: null,
		manageTokenHash: await sha256Hex(token),
		holdExpiresAt: status === "unverified" ? toIso(now + settings.verificationHoldMinutes * 60_000) : null,
		icsSequence: 0,
		verifiedAt: status === "unverified" ? null : nowIso,
		confirmedAt: status === "confirmed" ? nowIso : null,
		cancelledAt: null,
		cancelledBy: null,
		cancelReason: null,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	const rows = notificationsFor(ctx, booking, names, "created", token);

	const d1 = ctx.env.DB;
	const columns = getTableColumns(bookings);
	const keys = Object.keys(booking) as (keyof Booking)[];
	const active = ACTIVE_BOOKING_STATUSES.map(() => "?").join(", ");

	let inserted: D1Result | undefined;
	try {
		[, inserted] = await d1.batch([
			// 先釋出同一時段已過保留期限的未驗證預約，否則 unique index 會擋下新預約
			d1
				.prepare(
					`UPDATE bookings SET status = 'expired', updated_at = ?
					 WHERE status = 'unverified' AND hold_expires_at <= ?
					   AND start_at < ? AND end_at > ? AND (counselor_id = ? OR room_id = ?)`,
				)
				.bind(nowIso, nowIso, booking.endAt, booking.startAt, booking.counselorId, booking.roomId),
			// 與任何有效預約時間重疊（不只相同起點）就不寫入；D1 batch 為單一交易，可防止並行預約重疊
			d1
				.prepare(
					`INSERT INTO bookings (${keys.map((k) => columns[k].name).join(", ")})
					 SELECT ${keys.map(() => "?").join(", ")}
					 WHERE NOT EXISTS (
						SELECT 1 FROM bookings
						WHERE status IN (${active})
						  AND (status <> 'unverified' OR hold_expires_at IS NULL OR hold_expires_at > ?)
						  AND start_at < ? AND end_at > ?
						  AND (counselor_id = ? OR room_id = ?)
					 )`,
				)
				.bind(
					...keys.map((k) => booking[k]),
					...ACTIVE_BOOKING_STATUSES,
					nowIso,
					booking.endAt,
					booking.startAt,
					booking.counselorId,
					booking.roomId,
				),
			...rows.map((r) =>
				d1
					.prepare(
						`INSERT INTO notifications (id, booking_id, channel, recipient, template, payload)
						 SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?)`,
					)
					.bind(r.id, r.bookingId, r.channel, r.recipient, r.template, JSON.stringify(r.payload), booking.id),
			),
		]);
	} catch (err) {
		// 同時有人預約同一時段：partial unique index 擋下
		if (String(err).includes("UNIQUE constraint failed")) return fail("slot_taken");
		throw err;
	}
	if (!inserted?.meta.changes) return fail("slot_taken");

	const dto = toDto({ booking, ...names }, settings, now);
	return { ok: true, value: { booking: dto, token, notificationIds: rows.map((r) => r.id!) } };
}

// ── 驗證 email ──────────────────────────────────────────

export async function verifyBooking(ctx: Ctx, token: string) {
	const found = await findByToken(ctx.db, token);
	if (!found) return fail("not_found");
	const b = found.booking;
	if (b.status !== "unverified") return fail("invalid_status");
	if (holdExpired(b, ctx.now)) return fail("hold_expired");

	const nowIso = toIso(ctx.now);
	const status: BookingStatus = ctx.settings.confirmationMode === "auto" ? "confirmed" : "pending";
	const done = await transition(
		ctx,
		found,
		"unverified",
		{ status, verifiedAt: nowIso, holdExpiresAt: null, confirmedAt: status === "confirmed" ? nowIso : null },
		(next) => notificationsFor(ctx, next, found, "verified", token),
	);
	if (!done) return fail("invalid_status");
	return {
		ok: true as const,
		value: { booking: toDto({ ...found, booking: done.booking }, ctx.settings, ctx.now), notificationIds: done.notificationIds },
	};
}

// ── 取消 ────────────────────────────────────────────────

export async function cancelBooking(ctx: Ctx, token: string) {
	const found = await findByToken(ctx.db, token);
	if (!found) return fail("not_found");
	const b = found.booking;
	if (!["unverified", "pending", "confirmed"].includes(b.status) || holdExpired(b, ctx.now)) {
		return fail("invalid_status");
	}
	if (!canCancel(b, ctx.settings, ctx.now)) return fail("too_late_to_cancel");

	const patch = {
		status: "cancelled" as const,
		cancelledAt: toIso(ctx.now),
		cancelledBy: "client" as const,
		icsSequence: b.icsSequence + 1,
	};
	// 未驗證的預約尚未通知任何人，取消時不寄信
	const done = await transition(ctx, found, b.status, patch, (next) =>
		b.status === "unverified" ? [] : notificationsFor(ctx, next, found, "cancelled", token),
	);
	if (!done) return fail("invalid_status");
	return {
		ok: true as const,
		value: { booking: toDto({ ...found, booking: done.booking }, ctx.settings, ctx.now), notificationIds: done.notificationIds },
	};
}

// ── 逾時（cron） ───────────────────────────────────────

export async function expireBookings(ctx: Ctx): Promise<{ expired: number; notificationIds: string[] }> {
	const { db, settings, now } = ctx;
	const nowIso = toIso(now);

	// 未驗證且超過保留期限：直接標記，不寄信
	const holds = await db
		.update(bookings)
		.set({ status: "expired", updatedAt: nowIso })
		.where(and(eq(bookings.status, "unverified"), lte(bookings.holdExpiresAt, nowIso)))
		.returning({ id: bookings.id });

	// 待確認超過期限：標記並通知個案
	const pendingCutoff = toIso(now - settings.pendingExpireHours * 3_600_000);
	const stale = await db
		.select({
			booking: bookings,
			counselorName: counselors.name,
			counselorEmail: counselors.email,
			roomName: rooms.name,
		})
		.from(bookings)
		.innerJoin(counselors, eq(bookings.counselorId, counselors.id))
		.innerJoin(rooms, eq(bookings.roomId, rooms.id))
		.where(
			and(
				eq(bookings.status, "pending"),
				// 以驗證時間（無驗證時為建立時間）起算
				lt(sql`coalesce(${bookings.verifiedAt}, ${bookings.createdAt})`, pendingCutoff),
			),
		)
		.limit(50);

	const notificationIds: string[] = [];
	let expired = holds.length;
	for (const found of stale) {
		const done = await transition(ctx, found, "pending", { status: "expired" }, (next) =>
			notificationsFor(ctx, next, found, "expired"),
		);
		if (!done) continue;
		expired++;
		notificationIds.push(...done.notificationIds);
	}
	return { expired, notificationIds };
}
