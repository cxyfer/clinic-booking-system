import { Link } from "react-router";
import type { CounselorDto, RoomDto } from "../../shared/api";
import { parseSpecialties } from "../lib/data";
import "./counselors.css";

interface Props {
	counselors: CounselorDto[];
	rooms: RoomDto[];
}

export function CounselorList({ counselors, rooms }: Props) {
	const roomNames = (ids: string[]) =>
		ids.length === 0
			? "所有諮商室"
			: ids.map((id) => rooms.find((r) => r.id === id)?.name ?? id).join("、");

	return (
		<ul className="counselors">
			{counselors.map((c) => {
				const specialties = parseSpecialties(c.bio);
				return (
					<li key={c.id} className="counselor">
						<div className="counselor-mark" aria-hidden="true">
							{c.name.slice(0, 1)}
						</div>
						<div className="counselor-body">
							<h3>
								{c.name}
								{c.title && <span className="counselor-title">{c.title}</span>}
							</h3>
							{specialties.length > 0 ? (
								<p className="counselor-specialties">
									擅長{specialties.join("、")}
								</p>
							) : (
								c.bio && <p className="counselor-specialties">{c.bio}</p>
							)}
							<p className="counselor-rooms">可在{roomNames(c.roomIds)}進行諮商</p>
						</div>
						<Link
							to={`/book?counselor=${encodeURIComponent(c.id)}`}
							className="btn btn-primary counselor-cta"
						>
							預約{c.name}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
