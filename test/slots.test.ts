import { describe, expect, it } from "vitest";
import { computeSlots, type SlotInput } from "../src/shared/slots";
import { wallClock, zonedToUtc } from "../src/shared/time";

// 2026-11-09 是週一；now 為 2026-11-02（週一）00:00（台北）
const NOW = Date.parse("2026-11-01T16:00:00.000Z");

function input(overrides: Partial<SlotInput> = {}): SlotInput {
	return {
		timezone: "Asia/Taipei",
		slotDurationMinutes: 50,
		slotIntervalMinutes: 60,
		minLeadHours: 12,
		maxAdvanceDays: 60,
		now: NOW,
		from: "2026-11-09",
		to: "2026-11-09",
		counselor: {
			rules: [{ weekday: 1, startTime: "10:00", endTime: "13:00" }],
			exceptions: [],
			busy: [],
		},
		rooms: [
			{ id: "rm_a", hours: [{ weekday: 1, startTime: "09:00", endTime: "21:00" }], exceptions: [], busy: [] },
			{ id: "rm_b", hours: [{ weekday: 1, startTime: "11:00", endTime: "21:00" }], exceptions: [], busy: [] },
		],
		...overrides,
	};
}

const times = (slots: ReturnType<typeof computeSlots>) => slots.map((s) => s.time);

describe("time 工具", () => {
	it("台北牆上時間轉 UTC", () => {
		expect(new Date(zonedToUtc("2026-11-09", 10 * 60, "Asia/Taipei")).toISOString()).toBe(
			"2026-11-09T02:00:00.000Z",
		);
	});

	it("處理夏令時間時區", () => {
		// 紐約 2026-07-01 為 UTC-4
		expect(new Date(zonedToUtc("2026-07-01", 9 * 60, "America/New_York")).toISOString()).toBe(
			"2026-07-01T13:00:00.000Z",
		);
		expect(wallClock(Date.parse("2026-12-01T14:00:00Z"), "America/New_York")).toEqual({
			date: "2026-12-01",
			minutes: 9 * 60,
		});
	});
});

describe("computeSlots", () => {
	it("依每週規則產生時段，並列出可用空間", () => {
		const slots = computeSlots(input());
		expect(times(slots)).toEqual(["10:00", "11:00", "12:00"]);
		expect(slots[0]).toMatchObject({
			startAt: "2026-11-09T02:00:00.000Z",
			endAt: "2026-11-09T02:50:00.000Z",
			roomIds: ["rm_a"],
		});
		expect(slots[1]!.roomIds).toEqual(["rm_a", "rm_b"]);
	});

	it("時段結束不可超過規則結束時間", () => {
		const slots = computeSlots(
			input({ counselor: { rules: [{ weekday: 1, startTime: "10:00", endTime: "11:40" }], exceptions: [], busy: [] } }),
		);
		expect(times(slots)).toEqual(["10:00"]);
	});

	it("其他星期沒有時段", () => {
		expect(computeSlots(input({ from: "2026-11-10", to: "2026-11-10" }))).toEqual([]);
	});

	it("心理師封鎖時間與加開時段", () => {
		const slots = computeSlots(
			input({
				counselor: {
					rules: [{ weekday: 1, startTime: "10:00", endTime: "13:00" }],
					exceptions: [
						{ date: "2026-11-09", startTime: "11:00", endTime: "12:00", kind: "block" },
						{ date: "2026-11-09", startTime: "15:00", endTime: "16:00", kind: "extra" },
					],
					busy: [],
				},
			}),
		);
		expect(times(slots)).toEqual(["10:00", "12:00", "15:00"]);
	});

	it("整天封鎖", () => {
		const slots = computeSlots(
			input({
				counselor: {
					rules: [{ weekday: 1, startTime: "10:00", endTime: "13:00" }],
					exceptions: [{ date: "2026-11-09", startTime: null, endTime: null, kind: "block" }],
					busy: [],
				},
			}),
		);
		expect(slots).toEqual([]);
	});

	it("心理師已有預約的時段排除", () => {
		const slots = computeSlots(
			input({
				counselor: {
					rules: [{ weekday: 1, startTime: "10:00", endTime: "13:00" }],
					exceptions: [],
					busy: [{ startAt: "2026-11-09T03:00:00.000Z", endAt: "2026-11-09T03:50:00.000Z" }],
				},
			}),
		);
		expect(times(slots)).toEqual(["10:00", "12:00"]);
	});

	it("空間被占用時只列出其他空間；全部被占用則沒有時段", () => {
		const busy = [{ startAt: "2026-11-09T03:00:00.000Z", endAt: "2026-11-09T03:50:00.000Z" }];
		const base = input();
		const slots = computeSlots({ ...base, rooms: [{ ...base.rooms[0]!, busy }, base.rooms[1]!] });
		expect(slots.find((s) => s.time === "11:00")!.roomIds).toEqual(["rm_b"]);

		const none = computeSlots({ ...base, rooms: base.rooms.map((r) => ({ ...r, busy })) });
		expect(times(none)).toEqual(["10:00", "12:00"]);
	});

	it("空間封鎖例外", () => {
		const base = input();
		const slots = computeSlots({
			...base,
			rooms: [
				{ ...base.rooms[0]!, exceptions: [{ date: "2026-11-09", startTime: null, endTime: null, kind: "block" }] },
				base.rooms[1]!,
			],
		});
		expect(times(slots)).toEqual(["11:00", "12:00"]);
	});

	it("最短提前時間", () => {
		// 11-09 00:00（台北）時，12 小時內的 10:00、11:00 不可預約
		const slots = computeSlots(input({ now: Date.parse("2026-11-08T16:00:00.000Z") }));
		expect(times(slots)).toEqual(["12:00"]);
	});

	it("最遠可預約天數與過去日期", () => {
		expect(computeSlots(input({ maxAdvanceDays: 3 }))).toEqual([]);
		// 過去日期不產生時段；今天（11-02）只剩超過 12 小時的 12:00
		const slots = computeSlots(input({ from: "2026-10-01", to: "2026-11-09" }));
		expect(slots.map((s) => `${s.date} ${s.time}`)).toEqual([
			"2026-11-02 12:00",
			"2026-11-09 10:00",
			"2026-11-09 11:00",
			"2026-11-09 12:00",
		]);
	});

	it("生效期間", () => {
		const slots = computeSlots(
			input({
				counselor: {
					rules: [{ weekday: 1, startTime: "10:00", endTime: "13:00", effectiveFrom: "2026-11-10" }],
					exceptions: [],
					busy: [],
				},
			}),
		);
		expect(slots).toEqual([]);
	});
});
