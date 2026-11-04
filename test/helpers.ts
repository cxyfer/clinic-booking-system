import { env } from "cloudflare:workers";

// 測試儲存僅在檔案間隔離，同檔案內的測試需自行清空
const TABLES = [
	"notifications",
	"bookings",
	"availability_exceptions",
	"availability_rules",
	"room_hours",
	"counselor_rooms",
	"counselors",
	"rooms",
	"settings",
];

export async function seedBasic() {
	await env.DB.batch([
		...TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
		env.DB.prepare(
			"INSERT INTO counselors (id, name, email, sort_order) VALUES ('co_a', 'A', 'a@example.com', 1), ('co_b', 'B', 'b@example.com', 2)",
		),
		env.DB.prepare("INSERT INTO rooms (id, name) VALUES ('rm_1', 'Room 1'), ('rm_2', 'Room 2')"),
		env.DB.prepare("INSERT INTO counselor_rooms (counselor_id, room_id) VALUES ('co_b', 'rm_2')"),
	]);
}

export function insertBooking(id: string, counselorId: string, roomId: string, status: string) {
	return env.DB.prepare(
		`INSERT INTO bookings (id, counselor_id, room_id, start_at, end_at, status, client_name, client_email, manage_token_hash)
		 VALUES (?, ?, ?, '2026-12-01T02:00:00.000Z', '2026-12-01T02:50:00.000Z', ?, 'X', 'x@example.com', ?)`,
	)
		.bind(id, counselorId, roomId, status, `hash_${id}`)
		.run();
}

// 每天 09:00–18:00 皆可預約（co_a 與所有空間）
export async function seedOpenHours() {
	const days = [0, 1, 2, 3, 4, 5, 6];
	await env.DB.batch([
		...days.map((d) =>
			env.DB.prepare(
				"INSERT INTO availability_rules (id, counselor_id, weekday, start_time, end_time) VALUES (?, 'co_a', ?, '09:00', '18:00')",
			).bind(`ar_${d}`, d),
		),
		...["rm_1", "rm_2"].flatMap((room) =>
			days.map((d) =>
				env.DB.prepare(
					"INSERT INTO room_hours (id, room_id, weekday, start_time, end_time) VALUES (?, ?, ?, '09:00', '18:00')",
				).bind(`rh_${room}_${d}`, room, d),
			),
		),
	]);
}

export function setSetting(key: string, value: unknown) {
	return env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
		.bind(key, JSON.stringify(value))
		.run();
}
