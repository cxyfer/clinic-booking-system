// 時區工具：資料庫存 UTC，時段規則以診所時區的「牆上時間」表示
// 日期字串格式 YYYY-MM-DD，時間字串格式 HH:MM

const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(timeZone, f);
	}
	return f;
}

// UTC 時間點在指定時區的牆上時間
export function wallClock(utcMs: number, timeZone: string) {
	const parts = Object.fromEntries(
		partsFormatter(timeZone)
			.formatToParts(new Date(utcMs))
			.map((p) => [p.type, p.value]),
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: Number(parts.hour) * 60 + Number(parts.minute),
	};
}

// 時區相對 UTC 的偏移（毫秒），以分鐘為精度
function offsetAt(utcMs: number, timeZone: string): number {
	const { date, minutes } = wallClock(utcMs, timeZone);
	const asUtc = parseDate(date) + minutes * MINUTE;
	return asUtc - Math.floor(utcMs / MINUTE) * MINUTE;
}

// 牆上時間轉 UTC；遇到夏令時間切換時以切換後的偏移為準
export function zonedToUtc(date: string, minutes: number, timeZone: string): number {
	const guess = parseDate(date) + minutes * MINUTE;
	const first = guess - offsetAt(guess, timeZone);
	const second = guess - offsetAt(first, timeZone);
	return second;
}

// YYYY-MM-DD → 當天 00:00 UTC 的毫秒數（只用於日期運算）
export function parseDate(date: string): number {
	const [y, m, d] = date.split("-").map(Number);
	return Date.UTC(y!, m! - 1, d!);
}

export function formatDate(utcMidnightMs: number): string {
	return new Date(utcMidnightMs).toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => formatDate(parseDate(date) + days * DAY);

// 0 = 週日 … 6 = 週六；日曆日期的星期與時區無關
export const weekdayOf = (date: string) => new Date(parseDate(date)).getUTCDay();

export function parseTime(time: string): number {
	const [h, m] = time.split(":").map(Number);
	return h! * 60 + m!;
}

export function formatTime(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const toIso = (ms: number) => new Date(ms).toISOString();
