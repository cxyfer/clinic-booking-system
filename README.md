# Clinic Booking System

部署在 Cloudflare Workers 的諮商診所預約系統：個案選擇心理師、時段與空間後送出預約；後台給管理員與心理師使用；預約異動時以 Email／Webhook 通知。

規格見 [docs/spec.md](docs/spec.md)。

## 技術

- 前端：React 19 + Vite + React Router
- API：Hono（同一個 Worker，以 Static Assets 提供前端）
- 資料庫：Cloudflare D1 + Drizzle ORM
- 通知：Resend／console（Email）、HMAC 簽章 Webhook
- 測試：Vitest + `@cloudflare/vitest-plugin`（在 workerd 中執行）

## 本地開發

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm db:seed:local      # 匯入 mock 心理師、空間、時段
pnpm dev                # http://localhost:5173
```

常用指令：

| 指令 | 說明 |
|---|---|
| `pnpm test` | 執行測試 |
| `pnpm typecheck` | 型別檢查 |
| `pnpm db:generate` | 修改 `src/worker/db/schema.ts` 後產生 migration |
| `pnpm db:reset:local` | 重建本地資料庫並重新匯入 mock 資料 |
| `pnpm cf-typegen` | 修改 `wrangler.jsonc` 或 `.dev.vars` 後重新產生 `Env` 型別 |

## 部署

```sh
pnpm wrangler login
pnpm deploy             # 首次部署會自動建立 D1 資料庫
pnpm db:migrate:remote
```

Secrets：

```sh
pnpm wrangler secret put RESEND_API_KEY        # EMAIL_PROVIDER=resend 時需要
pnpm wrangler secret put WEBHOOK_SECRET        # 使用 webhook 時需要
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

### 通知設定

| 情境 | 設定 |
|---|---|
| 有自己的網域 | 在 Resend 驗證網域，設 `EMAIL_PROVIDER=resend`、`EMAIL_FROM=Clinic <no-reply@your-domain>` |
| 沒有網域 | Resend 未驗證網域時只能寄給帳號本人，建議設 `EMAIL_PROVIDER=console`，改用 `WEBHOOK_URL` 接收通知 |

Webhook 請求帶有 `X-Signature: sha256=<HMAC-SHA256(body, WEBHOOK_SECRET)>`，接收端應驗證此簽章。

## 目錄結構

```
src/client/   React 前端（public/ 前台、admin/ 後台）
src/worker/   Hono API、DB schema、通知、cron
src/shared/   前後端共用的型別、常數、設定 schema
migrations/   D1 migrations（由 drizzle-kit 產生）
seed/         mock 資料
test/         Vitest 測試
```
