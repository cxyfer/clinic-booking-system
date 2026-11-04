import { useState } from "react";
import type { RoomDto } from "../../shared/api";
import type { Slot } from "../../shared/slots";
import { addDays, wallClock, weekdayOf } from "../../shared/time";
import { roomTheme } from "../lib/data";
import { dateParts, formatDate } from "../lib/datetime";
import { useAvailability } from "../lib/useAvailability";
import "./slots.css";

const WINDOW_DAYS = 14;
const WEEK_HEAD = ["一", "二", "三", "四", "五", "六", "日"];

export interface SlotChoice {
	startAt: string;
	roomId: string;
}

interface Props {
	counselorId: string;
	timezone: string;
	maxAdvanceDays: number;
	rooms: RoomDto[];
	value: Partial<SlotChoice>;
	onChange: (value: Partial<SlotChoice>) => void;
}

// 以週一為首的兩週月曆，往後翻頁直到可預約的最遠日期
export function SlotPicker({ counselorId, timezone, maxAdvanceDays, rooms, value, onChange }: Props) {
	const today = wallClock(Date.now(), timezone).date;
	const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
	const lastDay = addDays(today, maxAdvanceDays);
	const [page, setPage] = useState(0);
	const from = addDays(monday, page * WINDOW_DAYS);
	const hasNext = addDays(from, WINDOW_DAYS) <= lastDay;

	const availability = useAvailability(counselorId, from, WINDOW_DAYS);
	const slots = availability.data?.slots ?? [];
	const byDate = new Map<string, Slot[]>();
	for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

	const selectedSlot = slots.find((s) => s.startAt === value.startAt);
	const [pickedDate, setPickedDate] = useState<string>();
	// 預設選第一個有空檔的日期
	const date =
		selectedSlot?.date ?? (pickedDate && byDate.has(pickedDate) ? pickedDate : slots[0]?.date);
	const daySlots = date ? (byDate.get(date) ?? []) : [];
	const roomsById = new Map(rooms.map((r, i) => [r.id, { room: r, theme: roomTheme(i) }]));

	const pickSlot = (slot: Slot) => {
		// 只有一間可用時直接帶入；原本選的空間仍可用則保留
		const roomId =
			slot.roomIds.length === 1
				? slot.roomIds[0]
				: value.roomId && slot.roomIds.includes(value.roomId)
					? value.roomId
					: undefined;
		onChange({ startAt: slot.startAt, roomId });
	};

	const turnPage = (delta: number) => {
		setPage((p) => p + delta);
		setPickedDate(undefined);
		onChange({});
	};

	const short = (d: string) => `${dateParts(d).month}月${dateParts(d).day}日`;
	const range = `${short(from)} – ${short(addDays(from, WINDOW_DAYS - 1))}`;

	return (
		<div className="slot-picker">
			<div className="cal">
				<div className="cal-nav">
					<button type="button" className="cal-turn" onClick={() => turnPage(-1)} disabled={page === 0}>
						<span aria-hidden="true">‹</span>
						<span className="visually-hidden">前兩週</span>
					</button>
					<p aria-live="polite">{range}</p>
					<button type="button" className="cal-turn" onClick={() => turnPage(1)} disabled={!hasNext}>
						<span aria-hidden="true">›</span>
						<span className="visually-hidden">後兩週</span>
					</button>
				</div>

				<div className="cal-grid" role="radiogroup" aria-label="日期">
					{WEEK_HEAD.map((d) => (
						<span key={d} className="cal-head" aria-hidden="true">
							{d}
						</span>
					))}
					{Array.from({ length: WINDOW_DAYS }, (_, i) => {
						const d = addDays(from, i);
						const count = byDate.get(d)?.length ?? 0;
						const p = dateParts(d);
						const label = `${formatDate(d)}，${count ? `${count} 個時段` : "沒有空檔"}`;
						return (
							<label key={d} className="cal-day" data-empty={count === 0 || undefined}>
								<input
									type="radio"
									name="date"
									value={d}
									checked={d === date}
									disabled={count === 0}
									onChange={() => {
										setPickedDate(d);
										onChange({});
									}}
									aria-label={label}
								/>
								<span className="cal-num" aria-hidden="true">
									{p.day === 1 || i === 0 ? `${p.month}/${p.day}` : p.day}
								</span>
								{count > 0 && <span className="cal-dot" aria-hidden="true" />}
							</label>
						);
					})}
				</div>

				{availability.loading && <p className="status-text">正在查詢空檔…</p>}
				{availability.error && (
					<p className="status-text" role="alert">
						無法載入時段。
						<button type="button" className="link-btn" onClick={availability.reload}>
							再試一次
						</button>
					</p>
				)}
				{availability.data && slots.length === 0 && (
					<p className="status-text">
						這兩週沒有空檔。{hasNext ? "可以往後翻看看，或換一位心理師。" : "可以換一位心理師看看。"}
					</p>
				)}
			</div>

			<div className="slot-side">
				{date && (
					<fieldset className="slot-group">
						<legend>{formatDate(date)}</legend>
						<div className="time-list">
							{daySlots.map((s) => (
								<label key={s.startAt} className="time-pill">
									<input
										type="radio"
										name="time"
										value={s.startAt}
										checked={s.startAt === value.startAt}
										onChange={() => pickSlot(s)}
									/>
									{s.time}
								</label>
							))}
						</div>
					</fieldset>
				)}

				{selectedSlot && (
					<fieldset className="slot-group">
						<legend>諮商室</legend>
						<div className="choice-list">
							{selectedSlot.roomIds.map((id) => {
								const entry = roomsById.get(id);
								if (!entry) return null;
								return (
									<label key={id} className={`choice choice-room room-${entry.theme}`}>
										<input
											type="radio"
											name="room"
											value={id}
											checked={id === value.roomId}
											onChange={() => onChange({ startAt: selectedSlot.startAt, roomId: id })}
										/>
										<span className="choice-swatch" aria-hidden="true" />
										<span className="choice-text">
											<strong>{entry.room.name}</strong>
											{entry.room.description && <span>{entry.room.description}</span>}
										</span>
									</label>
								);
							})}
						</div>
					</fieldset>
				)}
			</div>
		</div>
	);
}
