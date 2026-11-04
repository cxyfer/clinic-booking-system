import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useSettings } from "../lib/data";
import { SiteFooter } from "./SiteFooter";
import "./layout.css";

// React Router 不會自動捲動到 hash，換頁時手動處理
function useScrollToHash() {
	const { pathname, hash } = useLocation();
	useEffect(() => {
		if (!hash) {
			window.scrollTo(0, 0);
			return;
		}
		document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
	}, [pathname, hash]);
}

export function PublicLayout() {
	const { data: settings } = useSettings();
	const clinicName = settings?.clinicName ?? "";
	useScrollToHash();

	useEffect(() => {
		if (clinicName) document.title = `${clinicName}｜線上預約`;
	}, [clinicName]);

	return (
		<>
			<a className="skip-link" href="#main">
				跳到主要內容
			</a>
			<header className="site-header">
				<div className="wrap site-header-inner">
					<Link to="/" className="site-brand">
						{clinicName}
					</Link>
					<nav aria-label="主要選單" className="site-nav">
						<Link to="/#counselors">心理師</Link>
						<Link to="/#rooms">諮商室</Link>
						<Link to="/#how">預約方式</Link>
						<Link to="/book" className="btn btn-light site-nav-cta">
							預約諮商
						</Link>
					</nav>
				</div>
			</header>
			<main id="main" className="on-light">
				<Outlet />
			</main>
			<SiteFooter />
		</>
	);
}
