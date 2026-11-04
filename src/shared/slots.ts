import { addDays, formatTime, parseTime, toIso, wallClock, weekdayOf, zonedToUtc } from "./time";

// 純函式：輸入規則與既有預約，輸出可預約時段；不依賴資料庫，方便測試

export interface WeeklyWindow {
	weekday: number;
	startTime: string;
	endTime: string;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
}

export interface DateException {
	date: string;
	// 皆為 null 表示整天
	startTime: string | null;
	endTime: string | null;
	kind: "block" | "extra";
}

export interface BusyInterval {
	startAt: string;
	endAt: string;
}

export interface RoomInput {
	id: string;
	hours: WeeklyWindow[];
	exceptions: DateException[];
	busy: BusyInterval[];
}

export interface SlotInput {
	timezone: string;
	slotDurationMinutes: number;
	slotIntervalMinutes: number;
	minLeadHours: number;
	maxAdvanceDays: number;
	now: number;
	// 診所時區的日期範圍（含頭尾）
	from: string;
	to: string;
	counselor: {
		rules: WeeklyWindow[];
		exceptions: DateException[];
		busy: BusyInterval[];
	};
	// 已依心理師可用空間篩選過的諮商室
	rooms: RoomInput[];
}

export interface Slot {
	date: string;
	time: string;
	startAt: string;
	endAt: string;
	roomIds: string[];
}

type Window = [start: number, end: number];

const DAY_MINUTES = 24 * 60;

function inEffect(w: WeeklyWindow, date: string) {
	return (!w.effectiveFrom || w.effectiveFrom <= date) && (!w.effectiveTo || date <= w.effectiveTo);
}

const exceptionWindow = (e: DateException): Window => [
	e.startTime ? parseTime(e.startTime) : 0,
	e.endTime ? parseTime(e.endTime) : DAY_MINUTES,
];

// 當天的可用時間窗（分鐘）：每週規則 + 加開 − 封鎖
function windowsOn(date: string, weekly: WeeklyWindow[], exceptions: DateException[]): Window[] {
	const weekday = weekdayOf(date);
	const todays = exceptions.filter((e) => e.date === date);
	const open: Window[] = [
		...weekly
			.filter((w) => w.weekday === weekday && inEffect(w, date))
			.map((w): Window => [parseTime(w.startTime), parseTime(w.endTime)]),
		...todays.filter((e) => e.kind === "extra").map(exceptionWindow),
	];
	const blocks = todays.filter((e) => e.kind === "block").map(exceptionWindow);
	return blocks.reduce<Window[]>((acc, block) => acc.flatMap((w) => subtract(w, block)), open);
}

function subtract([s, e]: Window, [bs, be]: Window): Window[] {
	if (be <= s || bs >= e) return [[s, e]];
	const out: Window[] = [];
	if (bs > s) out.push([s, bs]);
	if (be < e) out.push([be, e]);
	return out;
}

const covers = (windows: Window[], start: number, end: number) =>
	windows.some(([s, e]) => s <= start && end <= e);

function overlapsBusy(busy: BusyInterval[], startMs: number, endMs: number) {
	return busy.some((b) => Date.parse(b.startAt) < endMs && startMs < Date.parse(b.endAt));
}

export function computeSlots(input: SlotInput): Slot[] {
	const { timezone, slotDurationMinutes: duration, slotIntervalMinutes: interval } = input;
	const earliest = input.now + input.minLeadHours * 3_600_000;
	const today = wallClock(input.now, timezone).date;
	const lastDate = addDays(today, input.maxAdvanceDays);
	const from = input.from < today ? today : input.from;
	const to = input.to > lastDate ? lastDate : input.to;

	const slots: Slot[] = [];
	for (let date = from; date <= to; date = addDays(date, 1)) {
		const counselorWindows = windowsOn(date, input.counselor.rules, input.counselor.exceptions);
		const roomWindows = input.rooms.map((r) => ({
			room: r,
			windows: windowsOn(date, r.hours, r.exceptions),
		}));
		// 同一個起始時間可能來自重疊的規則，避免重複
		const seen = new Set<number>();

		for (const [ws, we] of counselorWindows) {
			for (let start = ws; start + duration <= we; start += interval) {
				if (seen.has(start)) continue;
				seen.add(start);

				const startMs = zonedToUtc(date, start, timezone);
				const endMs = startMs + duration * 60_000;
				if (startMs < earliest) continue;
				if (overlapsBusy(input.counselor.busy, startMs, endMs)) continue;

				const roomIds = roomWindows
					.filter(
						({ room, windows }) =>
							covers(windows, start, start + duration) && !overlapsBusy(room.busy, startMs, endMs),
					)
					.map(({ room }) => room.id);
				if (roomIds.length === 0) continue;

				slots.push({ date, time: formatTime(start), startAt: toIso(startMs), endAt: toIso(endMs), roomIds });
			}
		}
	}
	return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// 範圍上限，避免一次計算過多天
export const MAX_RANGE_DAYS = 31;

export function clampRange(from: string, days: number) {
	return { from, to: addDays(from, Math.min(Math.max(days, 1), MAX_RANGE_DAYS) - 1) };
}

