// 未設定 TURNSTILE_SECRET_KEY 時略過驗證（本地開發、未啟用 Turnstile 的部署）
export async function verifyTurnstile(
	secret: string | undefined,
	token: string | undefined,
	remoteIp: string | undefined,
): Promise<boolean> {
	if (!secret) return true;
	if (!token) return false;

	const body = new FormData();
	body.append("secret", secret);
	body.append("response", token);
	if (remoteIp) body.append("remoteip", remoteIp);

	const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		body,
	});
	if (!res.ok) return false;
	const result = (await res.json()) as { success: boolean };
	return result.success;
}
