import type { WebhookEvent } from "./types";

const encoder = new TextEncoder();

export async function signPayload(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// 接收端以相同 secret 計算 HMAC 並比對 X-Signature 驗證來源
export async function sendWebhook(
	url: string,
	secret: string | undefined,
	event: WebhookEvent,
	deliveryId: string,
): Promise<void> {
	const body = JSON.stringify(event);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-Event-Type": event.type,
		"X-Delivery-Id": deliveryId,
	};
	if (secret) headers["X-Signature"] = await signPayload(secret, body);

	const res = await fetch(url, { method: "POST", headers, body });
	if (!res.ok) throw new Error(`Webhook ${res.status}`);
}
