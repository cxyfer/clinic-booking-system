// 選填 secrets：以 `cf workers secrets update <NAME> --worker clinic-booking-system --type secret_text --text <VALUE>` 設定，本地放 .dev.vars
declare namespace Cloudflare {
	interface Env {
		// EMAIL_PROVIDER=resend 時必填
		RESEND_API_KEY?: string;
		// 設定 WEBHOOK_URL 時建議設定，用於 X-Signature 簽章
		WEBHOOK_SECRET?: string;
		TURNSTILE_SECRET_KEY?: string;
	}
}
