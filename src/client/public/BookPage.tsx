import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { BookingDto, CounselorDto, CreateBookingResponse, RoomDto } from "../../shared/api";
import type { CreateBookingRequest } from "../../shared/booking-schema";
import type { PublicSettings } from "../../shared/settings";
import { Turnstile } from "../components/Turnstile";
import { api, ApiRequestError } from "../lib/api";
import { parseSpecialties, useCounselors, usePublicConfig, useRooms, useSettings } from "../lib/data";
import { formatDateTime, formatRange } from "../lib/datetime";
import { SlotPicker, type SlotChoice } from "./SlotPicker";
import "./book.css";

const STEPS = ["選擇心理師", "選時段和諮商室", "留下聯絡方式"];

export function BookPage() {
	const [params, setParams] = useSearchParams();
	const counselors = useCounselors();
	const rooms = useRooms();
	const { data: settings } = useSettings();
	const [created, setCreated] = useState<{ booking: BookingDto; email: string }>();

	const selectedId = params.get("counselor");
	const selected = counselors.data?.find((c) => c.id === selectedId);
	const choice: Partial<SlotChoice> = {
		startAt: params.get("at") ?? undefined,
		roomId: params.get("room") ?? undefined,
	};
	const requested = Number(params.get("step"));
	const step = !selected ? 1 : requested === 3 && choice.startAt && choice.roomId ? 3 : requested === 2 ? 2 : 1;

	const go = (next: Record<string, string | undefined>, replace = false) =>
		setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Record<string, string>, {
			replace,
		});

	// 換步驟時回到頁首（同一路徑，layout 不會自動捲動）
	// 新版瀏覽器的 scrollTo 會回傳 Promise，不可作為 effect 的回傳值（會被當成 cleanup 呼叫）
	useEffect(() => {
		window.scrollTo({ top: 0 });
	}, [step, created]);

	if (created && settings) return <CheckEmail {...created} settings={settings} />;

	return (
		<div className="book wrap">
			<header className="book-head">
				<h1>預約諮商</h1>
				<ol className="book-progress" aria-label="預約步驟">
					{STEPS.map((label, i) => (
						<li key={label} aria-current={i + 1 === step ? "step" : undefined}>
							<span aria-hidden="true">{i + 1}</span>
							{label}
						</li>
					))}
				</ol>
			</header>

			{step === 1 && (
				<fieldset className="book-panel">
					<legend>想和哪位心理師談？</legend>
					{counselors.error && (
						<p className="status-text" role="alert">
							無法載入心理師資料。請重新整理頁面，或直接來電預約。
						</p>
					)}
					{counselors.loading && <p className="status-text">正在載入心理師資料…</p>}
					<div className="choice-list">
						{counselors.data?.map((c) => {
							const specialties = parseSpecialties(c.bio);
							return (
								<label key={c.id} className="choice">
									<input
										type="radio"
										name="counselor"
										value={c.id}
										checked={c.id === selectedId}
										onChange={() => go({ counselor: c.id }, true)}
									/>
									<span className="choice-mark" aria-hidden="true">
										{c.name.slice(0, 1)}
									</span>
									<span className="choice-text">
										<strong>{c.name}</strong>
										<span>{specialties.length ? specialties.join("、") : c.title}</span>
									</span>
								</label>
							);
						})}
					</div>
					<div className="book-actions">
						<button
							type="button"
							className="btn btn-primary"
							disabled={!selected}
							onClick={() => selected && go({ counselor: selected.id, step: "2" })}
						>
							下一步：選時段
						</button>
					</div>
				</fieldset>
			)}

			{step === 2 && selected && settings && (
				<section className="book-panel" aria-labelledby="slot-title">
					<h2 id="slot-title">{selected.name}的空檔</h2>
					<p className="book-lead">
						每次 {settings.slotDurationMinutes} 分鐘。時間以診所所在地為準。
					</p>
					<SlotPicker
						counselorId={selected.id}
						timezone={settings.timezone}
						maxAdvanceDays={settings.maxAdvanceDays}
						rooms={rooms.data ?? []}
						value={choice}
						onChange={(v) => go({ counselor: selected.id, step: "2", at: v.startAt, room: v.roomId }, true)}
					/>
					<div className="book-actions">
						<Link to={`/book?counselor=${encodeURIComponent(selected.id)}`} className="btn btn-ghost">
							換一位心理師
						</Link>
						<button
							type="button"
							className="btn btn-primary"
							disabled={!choice.startAt || !choice.roomId}
							onClick={() => go({ counselor: selected.id, step: "3", at: choice.startAt, room: choice.roomId })}
						>
							下一步：留下聯絡方式
						</button>
					</div>
				</section>
			)}

			{step === 3 && selected && settings && (
				<ContactStep
					counselor={selected}
					room={rooms.data?.find((r) => r.id === choice.roomId)}
					choice={choice as SlotChoice}
					settings={settings}
					onBack={() => go({ counselor: selected.id, step: "2", at: choice.startAt, room: choice.roomId })}
					onCreated={setCreated}
				/>
			)}
		</div>
	);
}

interface ContactStepProps {
	counselor: CounselorDto;
	room: RoomDto | undefined;
	choice: SlotChoice;
	settings: PublicSettings;
	onBack: () => void;
	onCreated: (v: { booking: BookingDto; email: string }) => void;
}

function ContactStep({ counselor, room, choice, settings, onBack, onCreated }: ContactStepProps) {
	const navigate = useNavigate();
	const { data: config } = usePublicConfig();
	const siteKey = config?.turnstileSiteKey;
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<{ message: string; slotGone: boolean }>();

	const endAt = new Date(Date.parse(choice.startAt) + settings.slotDurationMinutes * 60_000).toISOString();
	// 最早可預約時間可能比取消期限更近，送出前先說清楚
	const pastCutoff = Date.parse(choice.startAt) - settings.clientCancelCutoffHours * 3_600_000 <= Date.now();

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const body: CreateBookingRequest = {
			counselorId: counselor.id,
			roomId: choice.roomId,
			startAt: choice.startAt,
			clientName: String(form.get("name")),
			clientEmail: String(form.get("email")),
			clientPhone: String(form.get("phone") ?? ""),
			turnstileToken: turnstileToken ?? undefined,
		};
		setSubmitting(true);
		setError(undefined);
		try {
			const res = await api<CreateBookingResponse>("/public/bookings", {
				method: "POST",
				body: JSON.stringify(body),
			});
			if (res.token) {
				navigate(`/booking#t=${res.token}`, { replace: true });
			} else {
				onCreated({ booking: res.booking, email: body.clientEmail });
			}
		} catch (err) {
			const slotGone = err instanceof ApiRequestError && err.status === 409;
			setError({
				message: err instanceof ApiRequestError ? err.message : "網路連線不穩，預約沒有送出。請再試一次。",
				slotGone,
			});
			setSubmitting(false);
		}
	}

	return (
		<section className="book-panel" aria-labelledby="contact-title">
			<h2 id="contact-title">留下聯絡方式</h2>
			<dl className="book-summary">
				<div>
					<dt>時間</dt>
					<dd>{formatRange(choice.startAt, endAt, settings.timezone)}</dd>
				</div>
				<div>
					<dt>心理師</dt>
					<dd>{counselor.name}</dd>
				</div>
				<div>
					<dt>諮商室</dt>
					<dd>{room?.name ?? "—"}</dd>
				</div>
			</dl>

			{pastCutoff && (
				<p className="book-deadline">
					這個時段距離現在不到 {settings.clientCancelCutoffHours} 小時，預約後無法在線上自行取消；需要調整請直接聯繫診所。
				</p>
			)}

			<form className="book-form" onSubmit={submit}>
				<label className="field">
					<span>姓名</span>
					<input name="name" required maxLength={50} autoComplete="name" />
				</label>
				<label className="field">
					<span>Email</span>
					<input name="email" type="email" required maxLength={254} autoComplete="email" />
					<small>
						{settings.requireEmailVerification
							? "我們會寄確認信到這個信箱，打開信中的連結並按下確認，才會保留時段。"
							: "預約通知與管理連結會寄到這個信箱。"}
					</small>
				</label>
				<label className="field">
					<span>
						電話<em>選填</em>
					</span>
					<input name="phone" type="tel" maxLength={20} autoComplete="tel" pattern="[0-9+\-\s()#]{6,20}" />
					<small>臨時需要調整時間時，我們會用電話聯絡你。</small>
				</label>

				{siteKey && <Turnstile siteKey={siteKey} onToken={setTurnstileToken} />}

				{error && (
					<div className="form-error" role="alert">
						<p>{error.message}</p>
						{error.slotGone && (
							<button type="button" className="link-btn" onClick={onBack}>
								回到選時段
							</button>
						)}
					</div>
				)}

				<div className="book-actions">
					<button type="button" className="btn btn-ghost" onClick={onBack}>
						改時段
					</button>
					<button type="submit" className="btn btn-primary" disabled={submitting || (!!siteKey && !turnstileToken)}>
						{submitting ? "送出中…" : "送出預約"}
					</button>
				</div>
			</form>
		</section>
	);
}

function CheckEmail({ booking, email, settings }: { booking: BookingDto; email: string; settings: PublicSettings }) {
	return (
		<div className="book wrap">
			<section className="book-done" aria-labelledby="done-title">
				<h1 id="done-title">還差一步：請到信箱確認</h1>
				<p>
					確認信已寄到 <strong>{email}</strong>。打開信中的連結，按下「確認預約」，時段才會為你保留。
				</p>
				{booking.holdExpiresAt && (
					<p className="book-deadline">
						請在 {formatDateTime(booking.holdExpiresAt, settings.timezone)} 前完成確認，逾時時段會開放給其他人。
					</p>
				)}
				<dl className="book-summary">
					<div>
						<dt>時間</dt>
						<dd>{formatRange(booking.startAt, booking.endAt, settings.timezone)}</dd>
					</div>
					<div>
						<dt>心理師</dt>
						<dd>{booking.counselor.name}</dd>
					</div>
					<div>
						<dt>諮商室</dt>
						<dd>{booking.room.name}</dd>
					</div>
				</dl>
				<p className="status-text">
					沒收到信？先看看垃圾郵件匣。
					{settings.contactInfo && <>仍然找不到的話，請聯繫我們：{settings.contactInfo}</>}
				</p>
			</section>
		</div>
	);
}
