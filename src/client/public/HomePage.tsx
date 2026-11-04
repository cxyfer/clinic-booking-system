import type { CounselorDto, RoomDto } from "../../shared/api";
import { useApi } from "../lib/useApi";

export function HomePage() {
	const counselors = useApi<CounselorDto[]>("/public/counselors");
	const rooms = useApi<RoomDto[]>("/public/rooms");

	if (counselors.error || rooms.error) return <p role="alert">資料載入失敗，請稍後再試。</p>;
	if (counselors.loading || rooms.loading) return <p>載入中…</p>;

	const roomName = (id: string) => rooms.data?.find((r) => r.id === id)?.name ?? id;

	return (
		<>
			<section>
				<h2>心理師</h2>
				<ul className="card-list">
					{counselors.data?.map((c) => (
						<li key={c.id} className="card">
							<h3>
								{c.name} <small>{c.title}</small>
							</h3>
							<p>{c.bio}</p>
							<p className="muted">
								可用空間：
								{c.roomIds.length ? c.roomIds.map(roomName).join("、") : "全部"}
							</p>
						</li>
					))}
				</ul>
			</section>
			<section>
				<h2>諮商空間</h2>
				<ul className="card-list">
					{rooms.data?.map((r) => (
						<li key={r.id} className="card">
							<h3>{r.name}</h3>
							<p>{r.description}</p>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
