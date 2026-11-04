import { NavLink } from "react-router";
import "./admin.css";

// TODO: 登入、預約管理、心理師／空間／時段管理、設定
const NAV = [
	{ to: "/admin", label: "預約" },
	{ to: "/admin/counselors", label: "心理師" },
	{ to: "/admin/rooms", label: "諮商室" },
	{ to: "/admin/schedule", label: "時段" },
	{ to: "/admin/settings", label: "設定" },
];

export function AdminApp() {
	return (
		<div className="admin on-light">
			<aside className="admin-side">
				<p className="admin-brand">後台管理</p>
				<nav aria-label="後台選單">
					<ul>
						{NAV.map((item) => (
							<li key={item.to}>
								<NavLink to={item.to} end>
									{item.label}
								</NavLink>
							</li>
						))}
					</ul>
				</nav>
			</aside>
			<main className="admin-main">
				<div className="admin-empty">
					<h1>後台還在建置中</h1>
					<p>完成後，你可以在這裡確認預約、管理心理師與諮商室、設定可預約時段和取消規則。</p>
				</div>
			</main>
		</div>
	);
}
