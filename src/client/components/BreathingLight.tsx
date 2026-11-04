import { useEffect, useRef, useState } from "react";
import "./breathing-light.css";

// 吸氣 4 秒、吐氣 6 秒：拉長吐氣有助於放鬆
const INHALE_MS = 4000;
const EXHALE_MS = 6000;
const CYCLE_MS = INHALE_MS + EXHALE_MS;

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

function usePrefersReducedMotion() {
	const query = "(prefers-reduced-motion: reduce)";
	const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setReduced(mql.matches);
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);
	return reduced;
}

export function BreathingLight() {
	const reduced = usePrefersReducedMotion();
	const [paused, setPaused] = useState(false);
	const [phase, setPhase] = useState<"inhale" | "exhale">("inhale");
	const ref = useRef<HTMLDivElement>(null);
	// 暫停時記住進度，繼續時從同一個位置接著呼吸
	const elapsed = useRef(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (reduced) {
			el.style.setProperty("--breath", "0.6");
			return;
		}
		if (paused) return;

		let frame = 0;
		const start = performance.now() - elapsed.current;
		const tick = (now: number) => {
			const t = (now - start) % CYCLE_MS;
			elapsed.current = t;
			const inhaling = t < INHALE_MS;
			const v = inhaling ? ease(t / INHALE_MS) : 1 - ease((t - INHALE_MS) / EXHALE_MS);
			el.style.setProperty("--breath", v.toFixed(4));
			setPhase(inhaling ? "inhale" : "exhale");
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [paused, reduced]);

	return (
		<figure className="breathing" aria-label="呼吸練習：跟著光圈放大時吸氣，縮小時吐氣">
			<div className="breathing-stage" ref={ref} aria-hidden="true">
				<svg viewBox="0 0 400 400" className="breathing-svg">
					<defs>
						<radialGradient id="breath-glow">
							<stop offset="0%" stopColor="#fff6d6" />
							<stop offset="45%" stopColor="#f2d27a" stopOpacity="0.85" />
							<stop offset="100%" stopColor="#f2d27a" stopOpacity="0" />
						</radialGradient>
					</defs>
					<circle className="breathing-ring" cx="200" cy="200" r="190" />
					<circle className="breathing-ring" cx="200" cy="200" r="150" />
					<circle className="breathing-ring" cx="200" cy="200" r="110" />
					<circle className="breathing-halo" cx="200" cy="200" r="190" fill="url(#breath-glow)" />
					<circle className="breathing-core" cx="200" cy="200" r="64" />
				</svg>
				<span className="breathing-word">
					{reduced ? "" : phase === "inhale" ? "吸氣" : "吐氣"}
				</span>
			</div>
			<figcaption className="breathing-caption">
				{reduced ? (
					<p>依自己的節奏，慢慢呼吸就好。</p>
				) : (
					<>
						<p>光圈變大時吸氣，變小時吐氣。</p>
						<button
							type="button"
							className="breathing-toggle"
							aria-pressed={paused}
							onClick={() => setPaused((p) => !p)}
						>
							{paused ? "繼續" : "暫停"}
						</button>
					</>
				)}
			</figcaption>
		</figure>
	);
}
