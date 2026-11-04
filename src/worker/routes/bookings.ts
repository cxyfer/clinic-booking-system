import { Hono, type Context } from "hono";
import type { ApiError, AvailabilityDto, CreateBookingResponse, PublicConfig } from "../../shared/api";
import { createBookingSchema, tokenSchema } from "../../shared/booking-schema";
import { clampRange } from "../../shared/slots";
import { wallClock } from "../../shared/time";
import type { AppEnv } from "../app";
import { loadSlots } from "../lib/availability";
import {
	cancelBooking,
	createBooking,
	lookupBooking,
	verifyBooking,
	type BookingError,
} from "../lib/bookings";
import { buildIcs } from "../lib/ics";
import { loadSettings } from "../lib/settings";
import { verifyTurnstile } from "../lib/turnstile";
import { processNotifications } from "../notify/outbox";

const ERRORS: Record<BookingError, [status: 400 | 404 | 409 | 410, message: string]> = {
	counselor_not_found: [404, "找不到這位心理師。"],
	slot_unavailable: [409, "這個時段或諮商室已無法預約，請重新選擇。"],
	slot_taken: [409, "這個時段剛被預約，請選擇其他時段。"],
	not_found: [404, "找不到這筆預約，請確認連結是否完整。"],
	invalid_status: [409, "這筆預約目前的狀態無法進行這個操作。"],
	hold_expired: [410, "確認期限已過，時段已經釋出。請重新預約。"],
	too_late_to_cancel: [409, "已超過可自行取消的期限，請直接聯繫診所。"],
};

const apiError = (c: Context, status: 400 | 403 | 404 | 409 | 410, code: string, message: string) =>
	c.json<ApiError>({ error: { code, message } }, status);

const bookingError = (c: Context, error: BookingError) => apiError(c, ERRORS[error][0], error, ERRORS[error][1]);

async function readJson(c: Context): Promise<unknown> {
	try {
		return await c.req.json();
	} catch {
		return null;
	}
}

// 回應後在背景寄送剛寫入的通知；失敗的由 cron 重試
function dispatch(c: Context<AppEnv>, ids: string[]) {
	if (ids.length === 0) return;
	c.executionCtx.waitUntil(processNotifications(c.env, c.get("db"), { ids }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const bookingRoutes = new Hono<AppEnv>()
	.get("/config", (c) => c.json<PublicConfig>({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null }))

	.get("/availability", async (c) => {
		const counselorId = c.req.query("counselor");
		if (!counselorId) return apiError(c, 400, "invalid_request", "缺少 counselor 參數。");

		const settings = await loadSettings(c.get("db"));
		const now = Date.now();
		const fromParam = c.req.query("from");
		const from = fromParam && DATE.test(fromParam) ? fromParam : wallClock(now, settings.timezone).date;
		const range = clampRange(from, Number(c.req.query("days")) || 14);

		const slots = await loadSlots(c.get("db"), settings, { counselorId, ...range, now });
		if (!slots) return bookingError(c, "counselor_not_found");
		return c.json<AvailabilityDto>({ timezone: settings.timezone, ...range, slots });
	})

	.post("/bookings", async (c) => {
		const parsed = createBookingSchema.safeParse(await readJson(c));
		if (!parsed.success) {
			return apiError(c, 400, "invalid_request", parsed.error.issues[0]?.message ?? "資料格式不正確。");
		}
		const { turnstileToken, ...input } = parsed.data;

		const human = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, turnstileToken, c.req.header("CF-Connecting-IP"));
		if (!human) return apiError(c, 403, "turnstile_failed", "無法確認你不是機器人，請重新整理頁面再試一次。");

		const settings = await loadSettings(c.get("db"));
		const result = await createBooking({ env: c.env, db: c.get("db"), settings, now: Date.now() }, input);
		if (!result.ok) return bookingError(c, result.error);

		dispatch(c, result.value.notificationIds);
		const { booking, token } = result.value;
		// 未驗證時不回傳 token，否則等同略過 email 驗證
		return c.json<CreateBookingResponse>({ booking, token: booking.status === "unverified" ? null : token }, 201);
	})

	// token 一律放在 body，避免出現在網址與請求紀錄
	.post("/bookings/lookup", async (c) => {
		const parsed = tokenSchema.safeParse(await readJson(c));
		if (!parsed.success) return bookingError(c, "not_found");
		const settings = await loadSettings(c.get("db"));
		const result = await lookupBooking({ env: c.env, db: c.get("db"), settings, now: Date.now() }, parsed.data.token);
		return result.ok ? c.json(result.value) : bookingError(c, result.error);
	})

	.post("/bookings/verify", async (c) => {
		const parsed = tokenSchema.safeParse(await readJson(c));
		if (!parsed.success) return bookingError(c, "not_found");
		const settings = await loadSettings(c.get("db"));
		const result = await verifyBooking({ env: c.env, db: c.get("db"), settings, now: Date.now() }, parsed.data.token);
		if (!result.ok) return bookingError(c, result.error);
		dispatch(c, result.value.notificationIds);
		return c.json(result.value.booking);
	})

	.post("/bookings/cancel", async (c) => {
		const parsed = tokenSchema.safeParse(await readJson(c));
		if (!parsed.success) return bookingError(c, "not_found");
		const settings = await loadSettings(c.get("db"));
		const result = await cancelBooking({ env: c.env, db: c.get("db"), settings, now: Date.now() }, parsed.data.token);
		if (!result.ok) return bookingError(c, result.error);
		dispatch(c, result.value.notificationIds);
		return c.json(result.value.booking);
	})

	.post("/bookings/ics", async (c) => {
		const parsed = tokenSchema.safeParse(await readJson(c));
		if (!parsed.success) return bookingError(c, "not_found");
		const settings = await loadSettings(c.get("db"));
		const result = await lookupBooking({ env: c.env, db: c.get("db"), settings, now: Date.now() }, parsed.data.token);
		if (!result.ok) return bookingError(c, result.error);

		const b = result.value;
		if (!["pending", "confirmed", "cancelled"].includes(b.status)) return bookingError(c, "invalid_status");
		const ics = buildIcs({
			uid: `${b.id}@clinic-booking-system`,
			sequence: b.icsSequence,
			startAt: b.startAt,
			endAt: b.endAt,
			summary: `心理諮商（${b.counselor.name}）`,
			location: [settings.clinicAddress, b.room.name].filter(Boolean).join(" "),
			cancelled: b.status === "cancelled",
		});
		return c.body(ics, 200, {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": 'attachment; filename="booking.ics"',
		});
	});
