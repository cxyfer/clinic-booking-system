import { describe, expect, it } from "vitest";
import { buildIcs } from "../src/worker/lib/ics";
import { formatSlot } from "../src/worker/lib/format";

describe("通知格式", () => {
	it("以診所時區顯示時段", () => {
		expect(formatSlot("2026-11-09T02:00:00.000Z", "2026-11-09T02:50:00.000Z", "Asia/Taipei")).toBe(
			"11月9日（週一）10:00–10:50",
		);
	});

	it("ics 跳脫特殊字元並折行", () => {
		const ics = buildIcs({
			uid: "bk_1@test",
			sequence: 1,
			startAt: "2026-11-09T02:00:00.000Z",
			endAt: "2026-11-09T02:50:00.000Z",
			summary: "諮商; 林, 予安",
			location: "台北市".repeat(20),
			cancelled: true,
		});
		expect(ics).toContain("METHOD:CANCEL");
		expect(ics).toContain("STATUS:CANCELLED");
		expect(ics).toContain("SUMMARY:諮商\\; 林\\, 予安");
		expect(ics).toContain("DTSTART:20261109T020000Z");
		// 每行不超過 75 bytes
		for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
	});
});
