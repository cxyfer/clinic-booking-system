import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import type { BookingDto } from "../../shared/api";
import type { PublicSettings } from "../../shared/settings";
import { api, ApiRequestError } from "../lib/api";
import { useSettings } from "../lib/data";
import { formatDateTime, formatRange, googleCalendarUrl } from "../lib/datetime";
import "./book.css";
import "./manage.css";

// 管理連結的 token 放在 # 之後，不會送到伺服器的請求紀錄
const tokenFromHash = (hash: string) => new URLSearchParams(hash.slice(1)).get("t");

const post = <T,>(path: string, token: string) =>
	api<T>(`/public/bookings/${path}`, { method: "POST", body: JSON.stringify({ token }) });

const STATUS_TEXT: Record<BookingDto["status"], { title: string; body?: string }> = {
	unverified: { title: "請確認這筆預約", body: "按下「確認預約」後，時段才會為你保留。" },
	pending: { title: "等待心理師確認", body: "心理師確認後，我們會再寄信通知你。" },
	confirmed: { title: "預約已成立" },
	cancelled: { title: "預約已取消", body: "如果還想預約，歡迎重新選擇時段。" },
	rejected: { title: "這個時段無法安排", body: "心理師無法在這個時段與你見面，歡迎選擇其他時段。" },
	expired: { title: "預約未能成立", body: "這筆預約沒有在期限內確認，時段已經釋出。歡迎重新預約。" },
	completed: { title: "諮商已結束" },
	no_show: { title: "這次諮商未出席" },
};

export function ManagePage() {
	const { hash } = useLocation();
	const token = tokenFromHash(hash);
	const { data: settings } = useSettings();
	const [booking, setBooking] = useState<BookingDto>();
	const [error, setError] = useState<string>();

	useEffect(() => {
		if (!token) return;
		let cancelled = false;
		post<BookingDto>("lookup", token)
			.then((b) => !cancelled && setBooking(b))
			.catch((e) => !cancelled && setError(e instanceof ApiRequestError ? e.message : "網路連線不穩，請重新整理頁面。"));
		return () => {
			cancelled = true;
		};
	}, [token]);

	return (
		<div className="book wrap">
			{!token ? (
				<Notice title="找不到預約連結">
					請從預約通知信中的連結打開這個頁面。想要新的預約，可以<Link to="/book">從這裡開始</Link>。
				</Notice>
			) : error ? (
				<Notice title="無法打開這筆預約">{error}</Notice>
			) : !booking || !settings ? (
				<p className="status-text">正在載入預約…</p>
			) : (
				<BookingView token={token} booking={booking} settings={settings} onChange={setBooking} />
			)}
		</div>
	);
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="book-done" aria-labelledby="notice-title">
			<h1 id="notice-title">{title}</h1>
			<p>{children}</p>
		</section>
	);
}

interface ViewProps {
	token: string;
	booking: BookingDto;
	settings: PublicSettings;
	onChange: (b: BookingDto) => void;
}

function BookingView({ token, booking, settings, onChange }: ViewProps) {
	const [busy, setBusy] = useState<"verify" | "cancel" | "ics">();
	const [confirmingCancel, setConfirmingCancel] = useState(false);
	const [error, setError] = useState<string>();
	const tz = settings.timezone;
	const text = STATUS_TEXT[booking.status];
	const location = [settings.clinicAddress, booking.room.name].filter(Boolean).join(" ");
	const isActive = booking.status === "unverified" || booking.status === "pending" || booking.status === "confirmed";

	async function run(action: "verify" | "cancel") {
		setBusy(action);
		setError(undefined);
		try {
			onChange(await post<BookingDto>(action, token));
			setConfirmingCancel(false);
		} catch (e) {
			setError(e instanceof ApiRequestError ? e.message : "網路連線不穩，請再試一次。");
		} finally {
			setBusy(undefined);
		}
	}

	async function downloadIcs() {
		setBusy("ics");
		setError(undefined);
		try {
			const res = await fetch("/api/public/bookings/ics", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token }),
			});
			if (!res.ok) throw new Error();
			const url = URL.createObjectURL(await res.blob());
			const a = Object.assign(document.createElement("a"), { href: url, download: "諮商預約.ics" });
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			setError("行事曆檔案下載失敗，請再試一次。");
		} finally {
			setBusy(undefined);
		}
	}

	return (
		<section className="manage" data-status={booking.status} aria-labelledby="manage-title">
			<p className="manage-status">{booking.clientName}的預約</p>
			<h1 id="manage-title">{text.title}</h1>
			{text.body && <p className="manage-body">{text.body}</p>}
			{booking.status === "unverified" && booking.holdExpiresAt && (
				<p className="book-deadline">請在 {formatDateTime(booking.holdExpiresAt, tz)} 前確認。</p>
			)}

			<dl className="book-summary">
				<div>
					<dt>時間</dt>
					<dd>{formatRange(booking.startAt, booking.endAt, tz)}</dd>
				</div>
				<div>
					<dt>心理師</dt>
					<dd>{booking.counselor.name}</dd>
				</div>
				<div>
					<dt>諮商室</dt>
					<dd>{booking.room.name}</dd>
				</div>
				{settings.clinicAddress && (
					<div>
						<dt>地點</dt>
						<dd>{settings.clinicAddress}</dd>
					</div>
				)}
			</dl>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}

			{booking.status === "unverified" && (
				<div className="book-actions">
					<button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run("verify")}>
						{busy === "verify" ? "確認中…" : "確認預約"}
					</button>
				</div>
			)}

			{booking.status === "confirmed" && (
				<div className="manage-calendar">
					<h2>加入行事曆</h2>
					<div className="book-actions">
						<button type="button" className="btn btn-ghost" disabled={!!busy} onClick={downloadIcs}>
							下載行事曆檔案（.ics）
						</button>
						<a
							className="btn btn-ghost"
							href={googleCalendarUrl({
								title: `心理諮商（${booking.counselor.name}）`,
								startAt: booking.startAt,
								endAt: booking.endAt,
								location,
							})}
							target="_blank"
							rel="noreferrer"
						>
							加到 Google 日曆
						</a>
					</div>
				</div>
			)}

			{isActive && (
				<div className="manage-cancel">
					<h2>取消預約</h2>
					{booking.canCancel ? (
						<>
							<p>
								{booking.cancelDeadline
									? `${formatDateTime(booking.cancelDeadline, tz)} 以前可以在這裡取消。`
									: "確認前隨時可以取消。"}
							</p>
							{confirmingCancel ? (
								<div className="cancel-confirm">
									<p>確定要取消嗎？取消後時段會開放給其他人。</p>
									<div className="book-actions">
										<button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => run("cancel")}>
											{busy === "cancel" ? "取消中…" : "確定取消"}
										</button>
										<button type="button" className="btn btn-ghost" onClick={() => setConfirmingCancel(false)}>
											保留預約
										</button>
									</div>
								</div>
							) : (
								<div className="book-actions">
									<button type="button" className="btn btn-ghost" onClick={() => setConfirmingCancel(true)}>
										取消這筆預約
									</button>
								</div>
							)}
						</>
					) : (
						<p>
							已超過可自行取消的期限（諮商開始前 {settings.clientCancelCutoffHours} 小時）。需要調整的話，請直接聯繫我們
							{settings.contactInfo ? `：${settings.contactInfo}` : "。"}
						</p>
					)}
				</div>
			)}

			{!isActive && (
				<div className="book-actions">
					<Link to="/book" className="btn btn-primary">
						重新預約
					</Link>
				</div>
			)}
		</section>
	);
}
