import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { CounselorDto, RoomDto } from "../../shared/api";
import { PUBLIC_SETTING_KEYS, type PublicSettings } from "../../shared/settings";
import type { AppEnv } from "../app";
import { counselorRooms, counselors, rooms } from "../db/schema";
import { loadSettings } from "../lib/settings";

export const publicRoutes = new Hono<AppEnv>()
	.get("/settings", async (c) => {
		const all = await loadSettings(c.get("db"));
		const picked = Object.fromEntries(
			PUBLIC_SETTING_KEYS.map((k) => [k, all[k]]),
		) as PublicSettings;
		return c.json(picked);
	})
	.get("/counselors", async (c) => {
		const db = c.get("db");
		const [list, links] = await Promise.all([
			db
				.select({
					id: counselors.id,
					name: counselors.name,
					title: counselors.title,
					bio: counselors.bio,
					photoUrl: counselors.photoUrl,
				})
				.from(counselors)
				.where(eq(counselors.isActive, true))
				.orderBy(asc(counselors.sortOrder), asc(counselors.name)),
			db.select().from(counselorRooms),
		]);
		const result: CounselorDto[] = list.map((co) => ({
			...co,
			// 空陣列表示可使用全部空間
			roomIds: links.filter((l) => l.counselorId === co.id).map((l) => l.roomId),
		}));
		return c.json(result);
	})
	.get("/rooms", async (c) => {
		const result: RoomDto[] = await c
			.get("db")
			.select({
				id: rooms.id,
				name: rooms.name,
				description: rooms.description,
				capacity: rooms.capacity,
				photoUrl: rooms.photoUrl,
			})
			.from(rooms)
			.where(eq(rooms.isActive, true))
			.orderBy(asc(rooms.sortOrder), asc(rooms.name));
		return c.json(result);
	});
