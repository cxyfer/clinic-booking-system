# Clinic Booking System

部署在 Cloudflare Workers 的諮商診所預約系統：個案選擇心理師、時段與空間後送出預約；後台給管理員與心理師使用；預約異動時以 Email／Webhook 通知。

規格見 [docs/spec.md](docs/spec.md)。

## 技術

- 前端：React 19 + Vite + React Router
- API：Hono（同一個 Worker，以 Static Assets 提供前端）
- 資料庫：Cloudflare D1 + Drizzle ORM
- 通知：Resend／console（Email）、HMAC 簽章 Webhook
- 測試：Vitest + `@cloudflare/vitest-plugin`（在 workerd 中執行）
- 工具：[`cf` CLI](https://developers.cloudflare.com/cf/)（beta），設定檔為 `cloudflare.config.ts`

## 本地開發

需要 Node.js 22.18 以上與 pnpm。

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm db:seed:local      # 匯入 mock 心理師、空間、時段
pnpm dev                # http://localhost:5173
```

本地資料存放於 `.cloudflare/state`。

常用指令：

| 指令 | 說明 |
|---|---|
| `pnpm test` | 執行測試 |
| `pnpm typecheck` | 產生 `Env` 型別並做型別檢查 |
| `pnpm db:generate` | 修改 `src/worker/db/schema.ts` 後產生 migration |
| `pnpm db:reset:local` | 重建本地資料庫並重新匯入 mock 資料 |
| `pnpm db:migrate:remote` | 套用 migration 到遠端 D1 |

> `pnpm deploy` 是 pnpm 內建指令，部署請用 `pnpm run deploy`。

## 部署

正式環境：<https://clinic-booking-system.gdst.workers.dev>

### 自動部署（Workers Builds）

推送到 `main` 時，Workers Builds 會自動建置並部署；PR 則產生預覽網址。設定值：

| 欄位 | 值 |
|---|---|
| Build command | `pnpm test && pnpm run build` |
| Deploy command | `npx cf deploy --prebuilt --mode production` |
| Non-production branch deploy command | `npx cf previews deploy` |

注意：資料庫 schema 有變更時，請在合併前手動執行 `pnpm db:migrate:remote`。

### 手動部署 / Fork 後自行部署

```sh
cf auth login
cf d1 create --name clinic-booking   # 將回傳的 uuid 填入 cloudflare.config.ts 的 DB.id
# 將 cloudflare.config.ts 的 PRODUCTION_URL 改為自己的 workers.dev 網址
pnpm db:migrate:remote
pnpm run deploy
```

選填 secrets（Worker 已存在後才能設定）：

```sh
cf workers secrets update RESEND_API_KEY --worker clinic-booking-system --type secret_text --text <VALUE>
cf workers secrets update WEBHOOK_SECRET --worker clinic-booking-system --type secret_text --text <VALUE>
cf workers secrets update TURNSTILE_SECRET_KEY --worker clinic-booking-system --type secret_text --text <VALUE>
```

### 通知設定

| 情境 | 設定 |
|---|---|
| 有自己的網域 | 在 Resend 驗證網域，在 `cloudflare.config.ts` 設 `EMAIL_PROVIDER` 為 `resend`、`EMAIL_FROM` 為 `Clinic <no-reply@your-domain>` |
| 沒有網域 | Resend 未驗證網域時只能寄給帳號本人，建議維持 `EMAIL_PROVIDER` 為 `console`，改用 `WEBHOOK_URL` 接收通知 |

> [!IMPORTANT]
> 預設需要 email 驗證，個案必須收到確認信才能保留時段。沒有實際寄信（`console` / `none`）時，請把 `requireEmailVerification` 改為 `false`，否則預約都會在保留期限後逾時。後台設定頁完成前，可直接寫入 D1：
> `cf d1 raw <DB_ID> --sql="INSERT OR REPLACE INTO settings (key, value) VALUES ('requireEmailVerification', 'false')"`
> `console` 會把信件內文（含管理連結）寫進 log，只適合本地開發。

### 防濫用（選填）

在 Cloudflare Dashboard 建立 Turnstile widget，將 site key 填入 `cloudflare.config.ts` 的 `TURNSTILE_SITE_KEY`，並以上方指令設定 `TURNSTILE_SECRET_KEY`。兩者需同時設定；只設定 secret 而沒有 site key 時，所有預約都會被擋下。

Webhook 請求帶有 `X-Signature: sha256=<HMAC-SHA256(body, WEBHOOK_SECRET)>`，接收端應驗證此簽章。

## 目錄結構

```
src/client/   React 前端（public/ 前台、admin/ 後台）
src/worker/   Hono API、DB schema、通知、cron
src/shared/   前後端共用的型別、常數、設定 schema
migrations/   D1 migrations（由 drizzle-kit 產生）
scripts/      D1 指令輔助腳本
seed/         mock 資料
test/         Vitest 測試
```
