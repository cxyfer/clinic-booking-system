import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
			return {
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					// 測試專用 binding，在 setup file 套用 migrations
					bindings: { TEST_MIGRATIONS: migrations },
				},
			};
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
