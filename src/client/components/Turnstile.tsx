import { useEffect, useRef } from "react";

declare global {
	interface Window {
		turnstile?: {
			render(el: HTMLElement, opts: Record<string, unknown>): string;
			remove(id: string): void;
		};
	}
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | undefined;

function loadScript() {
	loading ??= new Promise<void>((resolve, reject) => {
		const s = document.createElement("script");
		s.src = SCRIPT;
		s.async = true;
		s.onload = () => resolve();
		s.onerror = () => {
			loading = undefined;
			reject(new Error("Turnstile 載入失敗"));
		};
		document.head.append(s);
	});
	return loading;
}

// 只有在後端設定了 site key 時才會渲染
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const onTokenRef = useRef(onToken);
	onTokenRef.current = onToken;

	useEffect(() => {
		let id: string | undefined;
		let cancelled = false;
		loadScript()
			.then(() => {
				if (cancelled || !ref.current || !window.turnstile) return;
				id = window.turnstile.render(ref.current, {
					sitekey: siteKey,
					language: "zh-TW",
					callback: (t: string) => onTokenRef.current(t),
					"expired-callback": () => onTokenRef.current(null),
					"error-callback": () => onTokenRef.current(null),
				});
			})
			.catch(() => onTokenRef.current(null));
		return () => {
			cancelled = true;
			if (id) window.turnstile?.remove(id);
		};
	}, [siteKey]);

	return <div ref={ref} className="turnstile" />;
}
