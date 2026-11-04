import { app } from "./app";
import { runScheduled } from "./scheduled";

export default {
	fetch: app.fetch,
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(runScheduled(env));
	},
} satisfies ExportedHandler<Env>;
