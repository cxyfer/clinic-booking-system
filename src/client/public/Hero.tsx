import { Link } from "react-router";
import { BreathingLight } from "../components/BreathingLight";
import "./hero.css";

export function Hero({ clinicName }: { clinicName: string }) {
	return (
		<section className="hero" aria-labelledby="hero-title">
			<div className="wrap hero-inner">
				<div className="hero-text">
					<h1 id="hero-title">
						先坐下來，
						<br />
						慢慢說。
					</h1>
					<p className="hero-lede">
						{clinicName}提供個別、伴侶與兒童青少年諮商。在線上選好心理師、時段和諮商室，收到確認信就完成預約。
					</p>
					<div className="hero-actions">
						<Link to="/book" className="btn btn-light">
							預約諮商
						</Link>
						<Link to="/#counselors" className="btn btn-ghost">
							認識心理師
						</Link>
					</div>
				</div>
				<BreathingLight />
			</div>
		</section>
	);
}
