import { createBrowserRouter } from "react-router";
import { PublicLayout } from "./public/PublicLayout";
import { HomePage } from "./public/HomePage";

export const router = createBrowserRouter([
	{
		path: "/",
		Component: PublicLayout,
		children: [
			{ index: true, Component: HomePage },
			// TODO: /book、/booking/:id（管理連結）、/verify
		],
	},
	{
		// 後台獨立 chunk，前台使用者不需下載
		path: "/admin/*",
		lazy: async () => ({ Component: (await import("./admin/AdminApp")).AdminApp }),
	},
]);
