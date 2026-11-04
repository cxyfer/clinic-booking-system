import { Hono } from "hono";
import type { ApiError } from "../shared/api";
import { createDb, type Db } from "./db/client";
import { bookingRoutes } from "./routes/bookings";
import { publicRoutes } from "./routes/public";

export type AppEnv = {
	Bindings: Env;
	Variables: { db: Db };
};

export const app = new Hono<AppEnv>().basePath("/api");

app.use(async (c, next) => {
	c.set("db", createDb(c.env.DB));
	await next();
});

app.get("/health", (c) => c.json({ ok: true }));
app.route("/public", publicRoutes);
app.route("/public", bookingRoutes);

app.notFound((c) =>
	c.json<ApiError>({ error: { code: "not_found", message: "Not found" } }, 404),
);

app.onError((err, c) => {
	console.error(err);
	return c.json<ApiError>(
		{ error: { code: "internal_error", message: "Internal error" } },
		500,
	);
});
