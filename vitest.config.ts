import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
			return {
				// @cloudflare/vitest-plugin 尚不讀取 cloudflare.config.ts，測試用 binding 在此宣告
				miniflare: {
					compatibilityDate: "2026-11-01",
					d1Databases: ["DB"],
					bindings: {
						APP_URL: "http://localhost:5173",
						EMAIL_PROVIDER: "console",
						EMAIL_FROM: "Clinic <no-reply@example.com>",
						WEBHOOK_URL: "",
						WEBHOOK_SECRET: "test-webhook-secret",
						// 在 setup file 套用 migrations
						TEST_MIGRATIONS: migrations,
					},
				},
			};
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
