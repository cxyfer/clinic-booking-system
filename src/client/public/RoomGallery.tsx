import type { RoomDto } from "../../shared/api";
import { roomTheme, type RoomTheme } from "../lib/data";
import "./rooms.css";

// 每間諮商室的抽象圖樣：光斑、水紋、陽光
function RoomMotif({ theme }: { theme: RoomTheme }) {
	switch (theme) {
		case "forest":
			// 葉縫間落下的光斑
			return (
				<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
					{[
						[28, 30, 14],
						[70, 72, 22],
						[118, 26, 10],
						[150, 84, 16],
						[196, 40, 24],
						[226, 98, 9],
						[96, 108, 8],
					].map(([cx, cy, r]) => (
						<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
					))}
				</svg>
			);
		case "water":
			return (
				<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
					{[30, 54, 78, 102].map((y) => (
						<path key={y} d={`M0 ${y} q30 -14 60 0 t60 0 t60 0 t60 0`} />
					))}
				</svg>
			);
		case "sun":
			return (
				<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
					<circle cx="120" cy="120" r="70" />
					<circle cx="120" cy="120" r="44" />
					{[200, 220, 240, 260, 280, 300, 320, 340].map((deg) => {
						const r = (deg * Math.PI) / 180;
						return (
							<line
								key={deg}
								x1={120 + Math.cos(r) * 84}
								y1={120 + Math.sin(r) * 84}
								x2={120 + Math.cos(r) * 104}
								y2={120 + Math.sin(r) * 104}
							/>
						);
					})}
				</svg>
			);
	}
}

export function RoomGallery({ rooms }: { rooms: RoomDto[] }) {
	return (
		<ul className="rooms">
			{rooms.map((room, i) => {
				const theme = roomTheme(i);
				return (
					<li key={room.id} className={`room room-${theme}`}>
						<div className="room-motif">
							<RoomMotif theme={theme} />
						</div>
						<div className="room-body">
							<h3>{room.name}</h3>
							{room.description && <p>{room.description}</p>}
							{room.capacity != null && (
								<p className="room-capacity">最多 {room.capacity} 人</p>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
