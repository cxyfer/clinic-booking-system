// Cron 任務（每 5 分鐘）：
// - 重試到期的 queued 通知
// - 將逾時的 unverified / pending 預約標記為 expired
// - 寄送提醒信
// TODO: 實作預約流程時補上
export async function runScheduled(_env: Env): Promise<void> {}
