import { useSettings } from "../lib/data";

export function SiteFooter() {
	const { data: settings } = useSettings();

	return (
		<footer className="site-footer">
			<div className="wrap site-footer-inner">
				<section className="crisis" aria-labelledby="crisis-title">
					<h2 id="crisis-title">需要立即協助</h2>
					<p>
						如果你或身邊的人有立即的危險，請撥 <a href="tel:119">119</a>。
					</p>
					<p>想找人說說話，以下專線都有人接聽：</p>
					<ul className="hotlines">
						<li>
							<a href="tel:1925">1925</a>
							<span>衛福部安心專線，24 小時</span>
						</li>
						<li>
							<a href="tel:1995">1995</a>
							<span>生命線，24 小時</span>
						</li>
						<li>
							<a href="tel:1980">1980</a>
							<span>張老師專線</span>
						</li>
					</ul>
				</section>
				<section className="clinic-info" aria-label="診所資訊">
					<p className="clinic-info-name">{settings?.clinicName}</p>
					{settings?.clinicAddress && <p>{settings.clinicAddress}</p>}
					{settings?.contactInfo && <p>{settings.contactInfo}</p>}
				</section>
			</div>
		</footer>
	);
}
