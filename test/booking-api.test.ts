import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityDto, BookingDto, CreateBookingResponse } from "../src/shared/api";
import { addDays, wallClock } from "../src/shared/time";
import { app } from "../src/worker/app";
import { runScheduled } from "../src/worker/scheduled";
import { seedBasic, seedOpenHours, setSetting } from "./helpers";

// 呼叫 API 並等待 waitUntil 中的通知寄送完成
async function call(path: string, body?: unknown) {
	const ctx = createExecutionContext();
	const res = await app.request(
		`/api/public${path}`,
		body === undefined
			? {}
			: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
		env,
		ctx,
	);
	await waitOnExecutionContext(ctx);
	return res;
}

async function firstSlot() {
	const from = addDays(wallClock(Date.now(), "Asia/Taipei").date, 3);
	const res = await call(`/availability?counselor=co_a&from=${from}&days=1`);
	const body = await res.json<AvailabilityDto>();
	return body.slots[0]!;
}

const client = { clientName: "王小明", clientEmail: "client@example.com" };

async function book(overrides: Record<string, unknown> = {}) {
	const slot = await firstSlot();
	return call("/bookings", { counselorId: "co_a", roomId: slot.roomIds[0], startAt: slot.startAt, ...client, ...overrides });
}

const notificationRows = () =>
	env.DB.prepare("SELECT template, status, recipient, payload FROM notifications ORDER BY template").all<{
		template: string;
		status: string;
		recipient: string;
		payload: string;
	}>();

// ConsoleProvider 會把信件內文寫到 log，從中取出管理連結的 token
function captureTokens() {
	const tokens: string[] = [];
	vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
		for (const a of args) {
			const m = typeof a === "string" ? a.match(/#t=([\w-]+)/) : null;
			if (m) tokens.push(m[1]!);
		}
	});
	return tokens;
}

describe("可預約時段", () => {
	beforeEach(async () => {
		await seedBasic();
		await seedOpenHours();
	});

	it("列出時段與可用空間", async () => {
		const slot = await firstSlot();
		expect(slot.time).toBe("09:00");
		expect(slot.roomIds).toEqual(["rm_1", "rm_2"]);
	});

	it("心理師不存在時回傳 404", async () => {
		const res = await call("/availability?counselor=nobody");
		expect(res.status).toBe(404);
	});
});

describe("建立預約（需要 email 驗證）", () => {
	beforeEach(async () => {
		await seedBasic();
		await seedOpenHours();
	});
	afterEach(() => vi.restoreAllMocks());

	it("建立後不回傳 token，只寄確認信", async () => {
		const tokens = captureTokens();
		const res = await book();
		expect(res.status).toBe(201);
		const body = await res.json<CreateBookingResponse>();
		expect(body.token).toBeNull();
		expect(body.booking.status).toBe("unverified");
		expect(body.booking.holdExpiresAt).not.toBeNull();

		const { results } = await notificationRows();
		expect(results.map((r) => [r.template, r.status, r.recipient])).toEqual([
			["client.verify", "sent", "client@example.com"],
		]);
		// 寄出後移除內容
		expect(JSON.parse(results[0]!.payload)).toEqual({ redacted: true });
		expect(tokens).toHaveLength(1);
	});

	it("同一時段不能重複預約，已占用的時段從列表移除", async () => {
		const slot = await firstSlot();
		const input = { counselorId: "co_a", startAt: slot.startAt, ...client };
		expect((await call("/bookings", { ...input, roomId: "rm_1" })).status).toBe(201);
		// 心理師已被占用，換空間也不行
		const again = await call("/bookings", { ...input, roomId: "rm_2" });
		expect(again.status).toBe(409);
		expect((await firstSlot()).time).toBe("10:00");
	});

	it("驗證後進入待確認，通知心理師", async () => {
		const tokens = captureTokens();
		await book();
		const res = await call("/bookings/verify", { token: tokens[0] });
		expect(res.status).toBe(200);
		expect((await res.json<BookingDto>()).status).toBe("pending");

		const { results } = await notificationRows();
		expect(results.map((r) => [r.template, r.recipient])).toEqual([
			["client.received", "client@example.com"],
			["client.verify", "client@example.com"],
			["counselor.pending", "a@example.com"],
		]);

		// 再次驗證會失敗
		expect((await call("/bookings/verify", { token: tokens[0] })).status).toBe(409);
	});

	it("自動確認模式下驗證後直接成立，並可下載 ics", async () => {
		await setSetting("confirmationMode", "auto");
		const tokens = captureTokens();
		await book();
		const res = await call("/bookings/verify", { token: tokens[0] });
		expect((await res.json<BookingDto>()).status).toBe("confirmed");

		const ics = await call("/bookings/ics", { token: tokens[0] });
		expect(ics.headers.get("Content-Type")).toContain("text/calendar");
		expect(await ics.text()).toContain("BEGIN:VEVENT");
	});

	it("未驗證的預約取消時不寄信", async () => {
		const tokens = captureTokens();
		await book();
		const res = await call("/bookings/cancel", { token: tokens[0] });
		expect((await res.json<BookingDto>()).status).toBe("cancelled");
		const { results } = await notificationRows();
		expect(results.map((r) => r.template)).toEqual(["client.verify"]);
	});

	it("錯誤的 token 回傳 404", async () => {
		const res = await call("/bookings/lookup", { token: "x".repeat(43) });
		expect(res.status).toBe(404);
	});

	it("欄位格式錯誤回傳 400", async () => {
		const res = await book({ clientEmail: "not-an-email" });
		expect(res.status).toBe(400);
	});
});

describe("建立預約（不需驗證）", () => {
	beforeEach(async () => {
		await seedBasic();
		await seedOpenHours();
		await setSetting("requireEmailVerification", false);
	});

	it("直接回傳 token 並通知雙方", async () => {
		const res = await book();
		const body = await res.json<CreateBookingResponse>();
		expect(body.booking.status).toBe("pending");
		expect(body.token).toBeTruthy();

		const lookup = await call("/bookings/lookup", { token: body.token });
		expect((await lookup.json<BookingDto>()).id).toBe(body.booking.id);
	});

	it("超過取消期限時無法自行取消", async () => {
		// 第一個時段在 3 天後，期限設為 7 天前
		await setSetting("clientCancelCutoffHours", 24 * 7);
		const body = await (await book()).json<CreateBookingResponse>();
		expect(body.booking.canCancel).toBe(false);
		const res = await call("/bookings/cancel", { token: body.token });
		expect(res.status).toBe(409);
	});

	it("取消後時段重新開放，寄出取消通知", async () => {
		const body = await (await book()).json<CreateBookingResponse>();
		await call("/bookings/cancel", { token: body.token });
		expect((await firstSlot()).time).toBe("09:00");
		const { results } = await notificationRows();
		expect(results.map((r) => r.template)).toEqual([
			"client.cancelled",
			"client.received",
			"counselor.cancelled",
			"counselor.pending",
		]);
	});
});

describe("cron", () => {
	beforeEach(async () => {
		await seedBasic();
		await seedOpenHours();
	});
	afterEach(() => vi.restoreAllMocks());

	it("未驗證預約逾時後釋出時段", async () => {
		captureTokens();
		const body = await (await book()).json<CreateBookingResponse>();
		const result = await runScheduled(env, Date.parse(body.booking.holdExpiresAt!) + 1000);
		expect(result.expired).toBe(1);
		const row = await env.DB.prepare("SELECT status FROM bookings").first<{ status: string }>();
		expect(row?.status).toBe("expired");
	});

	it("待確認逾時後通知個案", async () => {
		await setSetting("requireEmailVerification", false);
		await book();
		const result = await runScheduled(env, Date.now() + 49 * 3_600_000);
		expect(result.expired).toBe(1);
		expect(result.notifications.sent).toBe(1);
		const { results } = await notificationRows();
		expect(results.map((r) => r.template)).toContain("client.expired");
	});

	it("寄送失敗時排程重試", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await env.DB.prepare(
			"INSERT INTO notifications (id, channel, recipient, template, payload) VALUES ('ntf_x', 'webhook', 'https://hooks.example.com/x', 'booking.created', '{}')",
		).run();
		const result = await runScheduled(env);
		expect(result.notifications.retrying).toBe(1);
		const row = await env.DB.prepare("SELECT status, attempts FROM notifications WHERE id = 'ntf_x'").first();
		expect(row).toEqual({ status: "queued", attempts: 1 });
	});
});
