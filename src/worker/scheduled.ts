import { createDb } from "./db/client";
import { expireBookings } from "./lib/bookings";
import { loadSettings } from "./lib/settings";
import { processNotifications } from "./notify/outbox";

// Cron 任務（每 5 分鐘）：
// - 將逾時的 unverified / pending 預約標記為 expired
// - 寄送／重試到期的 queued 通知
// TODO: 提醒信
export async function runScheduled(env: Env, now = Date.now()) {
	const db = createDb(env.DB);
	const settings = await loadSettings(db);
	const expired = await expireBookings({ env, db, settings, now });
	const notifications = await processNotifications(env, db, { now });
	if (expired.expired || notifications.sent || notifications.failed || notifications.retrying) {
		console.log("[cron]", { expired: expired.expired, ...notifications });
	}
	return { expired: expired.expired, notifications };
}
