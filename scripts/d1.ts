// 從 cloudflare.config.ts 讀取 D1 ID，轉呼叫 cf d1 指令
// 用法：node scripts/d1.ts migrate|seed [--local]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../cloudflare.config.ts", import.meta.url), "utf8");
const id = config.match(/bindings\.d1\(\{[^}]*id:\s*"([^"]+)"/)?.[1];
if (!id) throw new Error("cloudflare.config.ts 中找不到 DB 的 D1 id");

const [command, ...rest] = process.argv.slice(2);
// cf dev 的本地狀態存在 .cloudflare/state，--local 時需指定同一路徑
const flags = rest.includes("--local") ? [...rest, "--persist-to", ".cloudflare/state"] : rest;
const args =
	command === "migrate"
		? ["d1", "migrations", "apply", id, ...flags]
		: command === "seed"
			? ["d1", "raw", id, `--sql=${readFileSync("seed/seed.sql", "utf8")}`, ...flags]
			: null;
if (!args) throw new Error(`未知指令：${command}`);

execFileSync("cf", args, { stdio: "inherit" });
