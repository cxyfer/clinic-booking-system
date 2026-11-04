import { createBrowserRouter } from "react-router";
import { BookPage } from "./public/BookPage";
import { HomePage } from "./public/HomePage";
import { ManagePage } from "./public/ManagePage";
import { PublicLayout } from "./public/PublicLayout";

export const router = createBrowserRouter([
	{
		path: "/",
		Component: PublicLayout,
		children: [
			{ index: true, Component: HomePage },
			{ path: "book", Component: BookPage },
			// 管理連結：/booking#t=<token>
			{ path: "booking", Component: ManagePage },
		],
	},
	{
		// 後台獨立 chunk，前台使用者不需下載
		path: "/admin/*",
		lazy: async () => ({ Component: (await import("./admin/AdminApp")).AdminApp }),
	},
]);
