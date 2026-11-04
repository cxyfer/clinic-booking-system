import { bindings, defineConfig, triggers } from "cf/config";

// Fork 部署時請改成自己的網址
const PRODUCTION_URL = "https://clinic-booking-system.gdst.workers.dev";

export default defineConfig((ctx) => ({
	worker: {
		name: "clinic-booking-system",
		compatibilityDate: "2026-11-01",
		entrypoint: "src/worker/index.ts",
		workersDev: true,
		// PR 預覽網址（Workers Builds）
		previewUrls: true,
		observability: {
			enabled: true,
		},
		assets: {
			// SPA：非 /api 路徑交給前端 router 處理
			notFoundHandling: "single-page-application",
			runWorkerFirst: ["/api/*"],
		},
		triggers: [
			// 通知重試、pending／未驗證預約逾時、提醒信
			triggers.scheduled({ schedule: "*/5 * * * *" }),
		],
		env: {
			APP_URL: bindings.text(ctx.mode === "production" ? PRODUCTION_URL : "http://localhost:5173"),
			// resend | console | none
			EMAIL_PROVIDER: bindings.text("console"),
			EMAIL_FROM: bindings.text("Clinic <no-reply@example.com>"),
			// 留空則停用 webhook
			WEBHOOK_URL: bindings.text(""),
			// Cloudflare Turnstile site key；留空則不顯示驗證（需同時設定 TURNSTILE_SECRET_KEY secret）
			TURNSTILE_SITE_KEY: bindings.text(""),
			// migrations 目錄為預設的 ./migrations（cf d1 migrations apply --dir）
			// Fork 部署時請改成自己的 D1 ID（cf d1 create --name clinic-booking）
			DB: bindings.d1({
				name: "clinic-booking",
				id: "71d5cbb0-5418-4525-8a1e-d257a02f66ea",
			}),
			// 選填 secrets 不在此宣告（bindings.secret() 為必填，未設定時無法部署），
			// 型別見 src/worker/env.d.ts
		},
	},
}));
