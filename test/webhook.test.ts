import { describe, expect, it } from "vitest";
import { signPayload } from "../src/worker/notify/webhook";

describe("signPayload", () => {
	it("產生 HMAC-SHA256 簽章", async () => {
		// echo -n '{"a":1}' | openssl dgst -sha256 -hmac secret
		expect(await signPayload("secret", '{"a":1}')).toBe(
			"sha256=aa9e2e3575f5d7098b6caccd790888c36d5fdb63342a73bada2d6a51747a8494",
		);
	});
});
