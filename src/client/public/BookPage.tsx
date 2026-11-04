import { Link, useSearchParams } from "react-router";
import { parseSpecialties, useCounselors, useSettings } from "../lib/data";
import "./book.css";

const STEPS = ["選擇心理師", "選時段和諮商室", "留下聯絡方式"];

export function BookPage() {
	const [params, setParams] = useSearchParams();
	const counselors = useCounselors();
	const { data: settings } = useSettings();
	const selectedId = params.get("counselor");
	const selected = counselors.data?.find((c) => c.id === selectedId);
	const step = params.get("step") === "2" && selected ? 2 : 1;

	const select = (id: string) => setParams({ counselor: id }, { replace: true });

	return (
		<div className="book wrap">
			<header className="book-head">
				<h1>預約諮商</h1>
				<ol className="book-progress" aria-label="預約步驟">
					{STEPS.map((label, i) => (
						<li key={label} aria-current={i + 1 === step ? "step" : undefined}>
							<span aria-hidden="true">{i + 1}</span>
							{label}
						</li>
					))}
				</ol>
			</header>

			{step === 1 ? (
				<fieldset className="book-panel">
					<legend>想和哪位心理師談？</legend>
					{counselors.error && (
						<p className="status-text" role="alert">
							無法載入心理師資料。請重新整理頁面，或直接來電預約。
						</p>
					)}
					{counselors.loading && <p className="status-text">正在載入心理師資料…</p>}
					<div className="choice-list">
						{counselors.data?.map((c) => {
							const specialties = parseSpecialties(c.bio);
							return (
								<label key={c.id} className="choice">
									<input
										type="radio"
										name="counselor"
										value={c.id}
										checked={c.id === selectedId}
										onChange={() => select(c.id)}
									/>
									<span className="choice-mark" aria-hidden="true">
										{c.name.slice(0, 1)}
									</span>
									<span className="choice-text">
										<strong>{c.name}</strong>
										<span>{specialties.length ? specialties.join("、") : c.title}</span>
									</span>
								</label>
							);
						})}
					</div>
					<div className="book-actions">
						<button
							type="button"
							className="btn btn-primary"
							disabled={!selected}
							onClick={() => selected && setParams({ counselor: selected.id, step: "2" })}
						>
							下一步：選時段
						</button>
					</div>
				</fieldset>
			) : (
				<section className="book-panel" aria-labelledby="slot-title">
					<h2 id="slot-title">{selected?.name}的可預約時段</h2>
					<p className="book-pending">
						線上選時段的功能還在建置中。目前請直接聯繫診所，告訴我們你想預約{selected?.name}。
						{settings?.contactInfo && <span className="book-contact">{settings.contactInfo}</span>}
					</p>
					<div className="book-actions">
						<Link to={`/book?counselor=${encodeURIComponent(selected?.id ?? "")}`} className="btn btn-ghost">
							換一位心理師
						</Link>
					</div>
				</section>
			)}
		</div>
	);
}
