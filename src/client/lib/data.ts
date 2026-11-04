import type { CounselorDto, RoomDto } from "../../shared/api";
import type { PublicSettings } from "../../shared/settings";
import { useApi } from "./useApi";

export const useSettings = () => useApi<PublicSettings>("/public/settings");
export const useCounselors = () => useApi<CounselorDto[]>("/public/counselors");
export const useRooms = () => useApi<RoomDto[]>("/public/rooms");

// 心理師簡介目前以「專長：A、B、C。」的格式存放
export function parseSpecialties(bio: string | null): string[] {
	const match = bio?.match(/專長[：:]\s*(.+?)。?$/);
	return match?.[1] ? match[1].split(/[、,，]/).map((s) => s.trim()).filter(Boolean) : [];
}

// 諮商室的識別色與圖樣，依排序循環使用
export const ROOM_THEMES = ["forest", "water", "sun"] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number];
export const roomTheme = (index: number): RoomTheme => ROOM_THEMES[index % ROOM_THEMES.length]!;
