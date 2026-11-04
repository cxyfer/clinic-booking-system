import { buildIcs } from "../lib/ics";
import { formatSlot } from "../lib/format";
import type { EmailAttachment } from "./types";

// 寄送時需要的預約快照，寫入 notifications.payload
export interface BookingSnapshot {
	bookingId: string;
	counselorName: string;
	roomName: string;
	startAt: string;
	endAt: string;
	icsSequence: number;
	timezone: string;
	clinicName: string;
	clinicAddress: string;
	contactInfo: string;
	adminUrl: string;
}

export interface ClientPayload extends BookingSnapshot {
	clientName: string;
	// 寄出後會從 payload 移除
	manageUrl: string;
	holdMinutes?: number;
	cancelCutoffHours?: number;
}

export const EMAIL_TEMPLATES = [
	"client.verify",
	"client.received",
	"client.confirmed",
	"client.cancelled",
	"client.expired",
	"counselor.pending",
	"counselor.confirmed",
	"counselor.cancelled",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

interface Rendered {
	subject: string;
	text: string;
	html: string;
	attachments?: EmailAttachment[];
}

const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function details(p: BookingSnapshot) {
	return [
		["時間", formatSlot(p.startAt, p.endAt, p.timezone)],
		["心理師", p.counselorName],
		["諮商室", p.roomName],
		...(p.clinicAddress ? [["地點", p.clinicAddress]] : []),
	] as const;
}

// 純文字與 HTML 共用同一份段落結構
function compose(
	p: BookingSnapshot,
	subject: string,
	paragraphs: string[],
	action?: { label: string; url: string },
): Pick<Rendered, "subject" | "text" | "html"> {
	const rows = details(p);
	const footer = [p.clinicName, p.contactInfo].filter(Boolean).join("\n");

	const text = [
		...paragraphs,
		rows.map(([k, v]) => `${k}：${v}`).join("\n"),
		action ? `${action.label}：${action.url}` : "",
		footer,
	]
		.filter(Boolean)
		.join("\n\n");

	const html = `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#edf2ef;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#1d2b29;line-height:1.7">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:18px;font-weight:700;margin:0 0 24px">${escapeHtml(p.clinicName)}</p>
<div style="background:#fbfcfa;border-radius:14px;padding:28px">
${paragraphs.map((t) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`).join("")}
${
	rows.length
		? `<table style="border-collapse:collapse;margin:8px 0 16px">${rows
				.map(
					([k, v]) =>
						`<tr><td style="padding:4px 16px 4px 0;color:#56665f;white-space:nowrap">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`,
				)
				.join("")}</table>`
		: ""
}
${
	action
		? `<p style="margin:24px 0 8px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#2f6655;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px">${escapeHtml(action.label)}</a></p>`
		: ""
}
</div>
${footer ? `<p style="font-size:13px;color:#56665f;margin:24px 0 0;white-space:pre-line">${escapeHtml(footer)}</p>` : ""}
</div></body></html>`;

	return { subject, text, html };
}

function icsAttachment(p: BookingSnapshot, cancelled = false): EmailAttachment {
	const ics = buildIcs({
		uid: `${p.bookingId}@clinic-booking-system`,
		sequence: p.icsSequence,
		startAt: p.startAt,
		endAt: p.endAt,
		summary: `心理諮商（${p.counselorName}）`,
		location: [p.clinicAddress, p.roomName].filter(Boolean).join(" "),
		cancelled,
	});
	const bytes = new TextEncoder().encode(ics);
	return {
		filename: "booking.ics",
		content: btoa(String.fromCharCode(...bytes)),
		contentType: "text/calendar; charset=utf-8",
	};
}

export function renderEmail(template: EmailTemplate, payload: unknown): Rendered {
	const p = payload as ClientPayload;
	const manage = { label: "查看預約", url: p.manageUrl };

	switch (template) {
		case "client.verify":
			return compose(
				p,
				"請確認你的預約",
				[
					`${p.clientName}你好，我們收到了你的預約。`,
					`請在 ${p.holdMinutes ?? 15} 分鐘內打開下方連結，按下「確認預約」。逾時未確認，時段會開放給其他人。`,
				],
				{ label: "確認預約", url: p.manageUrl },
			);
		case "client.received":
			return compose(
				p,
				"已收到你的預約",
				[`${p.clientName}你好，我們已收到你的預約。心理師確認後，會再寄信通知你。`],
				manage,
			);
		case "client.confirmed":
			return {
				...compose(
					p,
					"預約已成立",
					[
						`${p.clientName}你好，你的預約已經成立。附件是行事曆檔案，可以加入你的行事曆。`,
						p.cancelCutoffHours != null
							? `需要取消的話，請在諮商開始前 ${p.cancelCutoffHours} 小時以前，從下方連結取消。`
							: "",
					].filter(Boolean),
					manage,
				),
				attachments: [icsAttachment(p)],
			};
		case "client.cancelled":
			return {
				...compose(p, "預約已取消", [`${p.clientName}你好，以下預約已經取消。`]),
				attachments: [icsAttachment(p, true)],
			};
		case "client.expired":
			return compose(p, "預約未能成立", [
				`${p.clientName}你好，以下預約未能在期限內確認，時段已經釋出。如果仍想預約，歡迎重新選擇時段。`,
			]);
		case "counselor.pending":
			return compose(p, "新預約待確認", ["有一筆新預約等待你確認。個案資料請到後台查看。"], {
				label: "前往後台",
				url: p.adminUrl,
			});
		case "counselor.confirmed":
			return {
				...compose(p, "新預約", ["有一筆新預約已經成立。個案資料請到後台查看。"], {
					label: "前往後台",
					url: p.adminUrl,
				}),
				attachments: [icsAttachment(p)],
			};
		case "counselor.cancelled":
			return {
				...compose(p, "預約已取消", ["以下預約已經取消。"]),
				attachments: [icsAttachment(p, true)],
			};
	}
}
