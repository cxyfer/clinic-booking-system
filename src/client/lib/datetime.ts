// 以診所時區顯示日期與時間，避免使用者裝置時區不同時看到錯的時間

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// YYYY-MM-DD（診所日期）→ 各部位
export function dateParts(date: string) {
	const [y, m, d] = date.split("-").map(Number) as [number, number, number];
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return { year: y, month: m, day: d, weekday: WEEKDAYS[weekday]! };
}

export function formatDate(date: string) {
	const p = dateParts(date);
	return `${p.month}月${p.day}日（週${p.weekday}）`;
}

function wall(iso: string, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date(iso));
	const get = (type: string) => parts.find((p) => p.type === type)!.value;
	return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// 例：11月9日（週一）10:00–10:50
export function formatRange(startAt: string, endAt: string, timeZone: string) {
	const start = wall(startAt, timeZone);
	return `${formatDate(start.date)} ${start.time}–${wall(endAt, timeZone).time}`;
}

export function formatDateTime(iso: string, timeZone: string) {
	const w = wall(iso, timeZone);
	return `${formatDate(w.date)} ${w.time}`;
}

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: { title: string; startAt: string; endAt: string; location?: string }) {
	const params = new URLSearchParams({
		action: "TEMPLATE",
		text: e.title,
		dates: `${compact(e.startAt)}/${compact(e.endAt)}`,
	});
	if (e.location) params.set("location", e.location);
	return `https://calendar.google.com/calendar/render?${params}`;
}
