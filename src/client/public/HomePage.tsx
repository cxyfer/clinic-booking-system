import { useCounselors, useRooms, useSettings } from "../lib/data";
import { BookingNotes, BookingSteps } from "./BookingSteps";
import { CounselorList } from "./CounselorList";
import { Hero } from "./Hero";
import { RoomGallery } from "./RoomGallery";

export function HomePage() {
	const settings = useSettings();
	const counselors = useCounselors();
	const rooms = useRooms();

	return (
		<>
			<Hero clinicName={settings.data?.clinicName ?? ""} />

			<section id="counselors" className="section" aria-labelledby="counselors-title">
				<div className="wrap split">
					<header className="section-head">
						<h2 id="counselors-title">心理師</h2>
						<p>不確定要找誰也沒關係。先看看誰擅長你在意的事，第一次諮商時，心理師會和你一起確認方向。</p>
					</header>
					{counselors.error || rooms.error ? (
						<p className="status-text" role="alert">
							無法載入心理師資料。請重新整理頁面，或直接來電預約。
						</p>
					) : counselors.data && rooms.data ? (
						<CounselorList counselors={counselors.data} rooms={rooms.data} />
					) : (
						<p className="status-text">正在載入心理師資料…</p>
					)}
				</div>
			</section>

			<section id="rooms" className="section section-rooms" aria-labelledby="rooms-title">
				<div className="wrap">
					<header className="section-head">
						<h2 id="rooms-title">諮商室</h2>
						<p>預約時可以選你待起來最自在的一間。</p>
					</header>
					{rooms.error ? (
						<p className="status-text" role="alert">
							無法載入諮商室資料。請重新整理頁面。
						</p>
					) : rooms.data ? (
						<RoomGallery rooms={rooms.data} />
					) : (
						<p className="status-text">正在載入諮商室資料…</p>
					)}
				</div>
			</section>

			<section id="how" className="section" aria-labelledby="how-title">
				<div className="wrap">
					<header className="section-head">
						<h2 id="how-title">預約方式</h2>
						<p>不用註冊帳號，也不用先打電話。</p>
					</header>
					{settings.data && (
						<>
							<BookingSteps settings={settings.data} />
							<BookingNotes settings={settings.data} />
						</>
					)}
				</div>
			</section>
		</>
	);
}
