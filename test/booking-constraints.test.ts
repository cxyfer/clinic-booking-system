import { beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedBasic } from "./helpers";

describe("bookings 防重複預約", () => {
	beforeEach(seedBasic);

	it("同一心理師同一時段不可有兩筆有效預約", async () => {
		await insertBooking("b1", "co_a", "rm_1", "confirmed");
		await expect(insertBooking("b2", "co_a", "rm_2", "pending")).rejects.toThrow(/UNIQUE/);
	});

	it("同一空間同一時段不可有兩筆有效預約", async () => {
		await insertBooking("b1", "co_a", "rm_1", "unverified");
		await expect(insertBooking("b2", "co_b", "rm_1", "confirmed")).rejects.toThrow(/UNIQUE/);
	});

	it("已取消的預約不占用時段", async () => {
		await insertBooking("b1", "co_a", "rm_1", "cancelled");
		await expect(insertBooking("b2", "co_a", "rm_1", "confirmed")).resolves.toBeTruthy();
	});
});
