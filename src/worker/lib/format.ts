import { formatTime, wallClock, weekdayOf } from "../../shared/time";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 通知內容用的日期時間格式，例如「11月9日（週一）10:00–10:50」
// 不依賴 Intl 的中文月份格式，各 runtime 輸出不一致
export function formatSlot(startAt: string, endAt: string, timeZone: string): string {
	const start = wallClock(Date.parse(startAt), timeZone);
	const end = wallClock(Date.parse(endAt), timeZone);
	const [, m, d] = start.date.split("-").map(Number);
	return `${m}月${d}日（週${WEEKDAYS[weekdayOf(start.date)]}）${formatTime(start.minutes)}–${formatTime(end.minutes)}`;
}
