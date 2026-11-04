import { useEffect, useState } from "react";
import { api } from "./api";

// 簡易資料抓取；需求變複雜時再換成 TanStack Query
export function useApi<T>(path: string) {
	const [data, setData] = useState<T>();
	const [error, setError] = useState<Error>();

	useEffect(() => {
		let cancelled = false;
		api<T>(path)
			.then((d) => !cancelled && setData(d))
			.catch((e: Error) => !cancelled && setError(e));
		return () => {
			cancelled = true;
		};
	}, [path]);

	return { data, error, loading: !data && !error };
}
