// 通知內容用的日期時間格式，例如「11月9日（週一）10:00–10:50」
export function formatSlot(startAt: string, endAt: string, timeZone: string): string {
	const date = new Intl.DateTimeFormat("zh-TW", {
		timeZone,
		month: "long",
		day: "numeric",
		weekday: "short",
	}).formatToParts(new Date(startAt));
	const get = (type: string) => date.find((p) => p.type === type)?.value ?? "";
	const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
	return `${get("month")}${get("day")}日（${get("weekday")}）${time.format(new Date(startAt))}–${time.format(new Date(endAt))}`;
}
