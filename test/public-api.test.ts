import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CounselorDto } from "../src/shared/api";
import { app } from "../src/worker/app";
import { seedBasic } from "./helpers";

describe("public API", () => {
	beforeEach(seedBasic);

	it("GET /api/health", async () => {
		const res = await app.request("/api/health", {}, env);
		expect(res.status).toBe(200);
	});

	it("列出心理師與綁定空間", async () => {
		const res = await app.request("/api/public/counselors", {}, env);
		const body = await res.json<CounselorDto[]>();
		expect(body.map((c) => [c.id, c.roomIds])).toEqual([
			["co_a", []],
			["co_b", ["rm_2"]],
		]);
	});

	it("設定缺值時回傳預設值", async () => {
		const res = await app.request("/api/public/settings", {}, env);
		const body = await res.json<Record<string, unknown>>();
		expect(body.confirmationMode).toBe("manual");
		expect(body.timezone).toBe("Asia/Taipei");
		// 非公開設定不應外洩
		expect(body).not.toHaveProperty("pendingExpireHours");
	});

	it("未知路徑回傳 JSON 404", async () => {
		const res = await app.request("/api/nope", {}, env);
		expect(res.status).toBe(404);
	});
});
