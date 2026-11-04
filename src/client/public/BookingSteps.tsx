import type { PublicSettings } from "../../shared/settings";
import "./steps.css";

// 依後台設定說明預約流程
function buildSteps(settings: PublicSettings) {
	const steps = [
		{ title: "選擇心理師", body: "看看每位心理師擅長的議題，選一位你想見的人。" },
		{ title: "選時段和諮商室", body: `每次諮商 ${settings.slotDurationMinutes} 分鐘。選好時間後，再挑一間你覺得自在的諮商室。` },
		{ title: "留下聯絡方式", body: "只需要姓名、Email 和電話，不用註冊帳號。" },
	];
	if (settings.requireEmailVerification) {
		steps.push({ title: "點擊確認信", body: "我們會寄一封信到你的信箱，點信中的連結才會保留時段。" });
	}
	steps.push(
		settings.confirmationMode === "manual"
			? { title: "等待心理師確認", body: "心理師確認後，你會收到預約成立的通知與行事曆檔案。" }
			: { title: "完成預約", body: "預約會立即成立，通知信中附有行事曆檔案。" },
	);
	return steps;
}

export function BookingSteps({ settings }: { settings: PublicSettings }) {
	return (
		<ol className="steps">
			{buildSteps(settings).map((step, i) => (
				<li key={step.title} className="step">
					<span className="step-num" aria-hidden="true">
						{i + 1}
					</span>
					<h3>{step.title}</h3>
					<p>{step.body}</p>
				</li>
			))}
		</ol>
	);
}

export function BookingNotes({ settings }: { settings: PublicSettings }) {
	return (
		<dl className="notes">
			<div>
				<dt>取消預約</dt>
				<dd>
					諮商開始前 {settings.clientCancelCutoffHours} 小時以前，可以用確認信中的連結自行取消；之後請直接聯繫我們。
				</dd>
			</div>
			<div>
				<dt>可預約的時間</dt>
				<dd>
					最早可預約 {settings.minLeadHours} 小時後的時段，最遠可預約 {settings.maxAdvanceDays} 天內。
				</dd>
			</div>
			<div>
				<dt>你的資料</dt>
				<dd>我們只收集預約需要的資料。通知信不會寫出你的姓名與聯絡方式。</dd>
			</div>
		</dl>
	);
}
