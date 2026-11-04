import { settingsSchema, type Settings } from "../../shared/settings";
import type { Db } from "../db/client";
import { settings } from "../db/schema";

// 讀取設定：DB 中缺少的 key 以 schema 預設值補上
export async function loadSettings(db: Db): Promise<Settings> {
	const rows = await db.select().from(settings);
	const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	return settingsSchema.parse(raw);
}
