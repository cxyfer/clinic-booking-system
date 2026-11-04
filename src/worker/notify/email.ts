import type { EmailMessage, EmailProvider } from "./types";

class ResendProvider implements EmailProvider {
	readonly name = "resend";
	constructor(
		private readonly apiKey: string,
		private readonly from: string,
	) {}

	async send(message: EmailMessage): Promise<void> {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
				"Idempotency-Key": message.idempotencyKey,
			},
			body: JSON.stringify({
				from: this.from,
				to: [message.to],
				subject: message.subject,
				html: message.html,
				text: message.text,
				attachments: message.attachments?.map((a) => ({
					filename: a.filename,
					content: a.content,
					content_type: a.contentType,
				})),
			}),
		});
		if (!res.ok) {
			throw new Error(`Resend ${res.status}: ${await res.text()}`);
		}
	}
}

// 開發／無網域時使用：只輸出到 log
class ConsoleProvider implements EmailProvider {
	readonly name = "console";
	async send(message: EmailMessage): Promise<void> {
		console.log("[email]", { to: message.to, subject: message.subject });
		console.log(message.text);
	}
}

class NoopProvider implements EmailProvider {
	readonly name = "none";
	async send(): Promise<void> {}
}

export function createEmailProvider(env: Env): EmailProvider {
	switch (env.EMAIL_PROVIDER) {
		case "resend":
			if (!env.RESEND_API_KEY) {
				throw new Error("EMAIL_PROVIDER=resend 需要設定 RESEND_API_KEY");
			}
			return new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
		case "none":
			return new NoopProvider();
		default:
			return new ConsoleProvider();
	}
}
