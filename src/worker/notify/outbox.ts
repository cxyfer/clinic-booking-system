import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { toIso } from "../../shared/time";
import type { Db } from "../db/client";
import { notifications } from "../db/schema";
import { newId } from "../lib/tokens";
import { createEmailProvider } from "./email";
import { renderEmail, type EmailTemplate } from "./templates";
import type { WebhookEvent } from "./types";
import { sendWebhook } from "./webhook";

type NewNotification = typeof notifications.$inferInsert;

// 重試間隔：1 分、5 分、30 分、2 小時、6 小時，之後標記為 failed
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
// 認領後的租約，避免 waitUntil 與 cron 同時寄送同一筆
const LEASE_MS = 300_000;

export function emailNotification(
	bookingId: string,
	template: EmailTemplate,
	recipient: string,
	payload: object,
): NewNotification {
	return { id: newId("ntf"), bookingId, channel: "email", recipient, template, payload };
}

// 未設定 WEBHOOK_URL 時不產生
export function webhookNotification(
	env: Env,
	bookingId: string,
	type: string,
	data: Record<string, unknown>,
	now: number,
): NewNotification[] {
	if (!env.WEBHOOK_URL) return [];
	const event: WebhookEvent = { type, occurredAt: toIso(now), data };
	return [{ id: newId("ntf"), bookingId, channel: "webhook", recipient: env.WEBHOOK_URL, template: type, payload: event }];
}

async function deliver(env: Env, row: typeof notifications.$inferSelect) {
	if (row.channel === "webhook") {
		await sendWebhook(row.recipient, env.WEBHOOK_SECRET, row.payload as WebhookEvent, row.id);
		return;
	}
	const rendered = renderEmail(row.template as EmailTemplate, row.payload);
	await createEmailProvider(env).send({ to: row.recipient, ...rendered, idempotencyKey: row.id });
}

export interface ProcessResult {
	sent: number;
	failed: number;
	retrying: number;
}

export async function processNotifications(
	env: Env,
	db: Db,
	opts: { ids?: string[]; now?: number; limit?: number } = {},
): Promise<ProcessResult> {
	const now = opts.now ?? Date.now();
	const nowIso = toIso(now);
	const due = and(eq(notifications.status, "queued"), lte(notifications.nextAttemptAt, nowIso));
	const result: ProcessResult = { sent: 0, failed: 0, retrying: 0 };

	const candidates = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(opts.ids ? and(due, inArray(notifications.id, opts.ids)) : due)
		.orderBy(asc(notifications.nextAttemptAt))
		.limit(opts.limit ?? 50);

	for (const { id } of candidates) {
		const [row] = await db
			.update(notifications)
			.set({ nextAttemptAt: toIso(now + LEASE_MS) })
			.where(and(eq(notifications.id, id), due))
			.returning();
		if (!row) continue;

		const attempts = row.attempts + 1;
		try {
			await deliver(env, row);
			await db
				.update(notifications)
				.set({
					status: "sent",
					attempts,
					sentAt: toIso(now),
					lastError: null,
					// 寄出後移除內容（含管理連結與個案姓名），只保留紀錄
					payload: { redacted: true },
				})
				.where(eq(notifications.id, id));
			result.sent++;
		} catch (err) {
			const exhausted = attempts >= MAX_ATTEMPTS;
			await db
				.update(notifications)
				.set({
					status: exhausted ? "failed" : "queued",
					attempts,
					lastError: String(err instanceof Error ? err.message : err).slice(0, 500),
					nextAttemptAt: toIso(now + (BACKOFF_MS[attempts - 1] ?? 0)),
				})
				.where(eq(notifications.id, id));
			if (exhausted) result.failed++;
			else result.retrying++;
			console.error("[notify] delivery failed", { id, attempts, err });
		}
	}
	return result;
}
