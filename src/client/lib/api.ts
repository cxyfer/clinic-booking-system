import type { ApiError } from "../../shared/api";

export class ApiRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as ApiError | null;
		throw new ApiRequestError(
			res.status,
			body?.error.code ?? "unknown",
			body?.error.message ?? res.statusText,
		);
	}
	return res.json() as Promise<T>;
}
