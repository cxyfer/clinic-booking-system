// 產生單一事件的 iCalendar 檔案（RFC 5545）
export interface IcsEvent {
	uid: string;
	sequence: number;
	startAt: string;
	endAt: string;
	summary: string;
	location?: string;
	description?: string;
	cancelled?: boolean;
}

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const escapeText = (text: string) =>
	text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// 每行最多 75 octets，超過以 CRLF + 空白折行
function fold(line: string): string {
	const bytes = new TextEncoder();
	const out: string[] = [];
	let current = "";
	for (const ch of line) {
		if (bytes.encode(current + ch).length > (out.length ? 74 : 75)) {
			out.push(current);
			current = ch;
		} else {
			current += ch;
		}
	}
	out.push(current);
	return out.join("\r\n ");
}

export function buildIcs(event: IcsEvent, now = new Date().toISOString()): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//clinic-booking-system//ZH-TW",
		"CALSCALE:GREGORIAN",
		`METHOD:${event.cancelled ? "CANCEL" : "PUBLISH"}`,
		"BEGIN:VEVENT",
		`UID:${event.uid}`,
		`SEQUENCE:${event.sequence}`,
		`DTSTAMP:${stamp(now)}`,
		`DTSTART:${stamp(event.startAt)}`,
		`DTEND:${stamp(event.endAt)}`,
		`SUMMARY:${escapeText(event.summary)}`,
		...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
		...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
		`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];
	return lines.map(fold).join("\r\n") + "\r\n";
}
