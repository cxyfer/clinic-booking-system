import { useEffect, useState } from "react";
import type { AvailabilityDto } from "../../shared/api";
import { api } from "./api";

// 時段變動頻繁，不共用快取；reload 用於預約失敗後重新抓取
export function useAvailability(counselorId: string | undefined, from: string, days: number) {
	const [state, setState] = useState<{ key: string; data?: AvailabilityDto; error?: Error }>({ key: "" });
	const [nonce, setNonce] = useState(0);
	const key = counselorId ? `${counselorId}|${from}|${days}|${nonce}` : "";

	useEffect(() => {
		if (!counselorId) return;
		let cancelled = false;
		const q = new URLSearchParams({ counselor: counselorId, from, days: String(days) });
		api<AvailabilityDto>(`/public/availability?${q}`)
			.then((data) => !cancelled && setState({ key, data }))
			.catch((error: Error) => !cancelled && setState({ key, error }));
		return () => {
			cancelled = true;
		};
	}, [counselorId, from, days, key]);

	const current = state.key === key ? state : { key };
	return {
		data: current.data,
		error: current.error,
		loading: !!counselorId && !current.data && !current.error,
		reload: () => setNonce((n) => n + 1),
	};
}
