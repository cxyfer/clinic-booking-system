export interface EmailAttachment {
	filename: string;
	// base64 編碼內容
	content: string;
	contentType?: string;
}

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
	attachments?: EmailAttachment[];
	// 重試時使用同一個 key，避免重複寄送
	idempotencyKey: string;
}

export interface EmailProvider {
	readonly name: string;
	send(message: EmailMessage): Promise<void>;
}

// Webhook payload 不含個案聯絡資料
export interface WebhookEvent {
	type: string;
	occurredAt: string;
	data: Record<string, unknown>;
}
