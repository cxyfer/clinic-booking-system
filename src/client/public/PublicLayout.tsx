import { Link, Outlet } from "react-router";
import type { PublicSettings } from "../../shared/settings";
import { useApi } from "../lib/useApi";

export function PublicLayout() {
	const { data: settings } = useApi<PublicSettings>("/public/settings");

	return (
		<div className="layout">
			<header className="site-header">
				<Link to="/" className="brand">
					{settings?.clinicName ?? "諮商預約"}
				</Link>
			</header>
			<main>
				<Outlet />
			</main>
		</div>
	);
}
