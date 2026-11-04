import { useEffect, useState } from "react";
import { api } from "./api";

// 同一路徑共用同一個請求，避免多個元件重複抓取；需求變複雜時再換成 TanStack Query
const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
	let p = cache.get(path) as Promise<T> | undefined;
	if (!p) {
		p = api<T>(path);
		// 失敗時移除快取，下次重新請求
		p.catch(() => cache.delete(path));
		cache.set(path, p);
	}
	return p;
}

export function useApi<T>(path: string) {
	const [data, setData] = useState<T>();
	const [error, setError] = useState<Error>();

	useEffect(() => {
		let cancelled = false;
		load<T>(path)
			.then((d) => !cancelled && setData(d))
			.catch((e: Error) => !cancelled && setError(e));
		return () => {
			cancelled = true;
		};
	}, [path]);

	return { data, error, loading: !data && !error };
}
