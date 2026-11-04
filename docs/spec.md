# 諮商診所預約系統 — MVP 規格（草案）

> 狀態：已確認（2026-11-04），進入實作。

## 1. 範圍

### MVP 包含
- 前台：選擇心理師 → 選擇日期與時段 → 選擇空間 → 填寫聯絡資料 → 送出預約
- 個案免註冊，以 email 中的「管理連結」查看、取消預約、下載日曆檔
- 預約成立模式可於後台切換：`auto`（送出即成立）／`manual`（需心理師或管理員確認）
- 取消規則可於後台設定（例如開始前 N 小時內不可自行取消）
- 通知：同時通知心理師與個案；Email（Resend）＋ Webhook
- 加入日曆：`.ics` 下載／附件、Google Calendar 連結
- 後台角色：
  - `admin`：管理所有心理師、空間、時段、預約、設定
  - `counselor`：（選用）只能查看自己的預約、管理自己的時段

### MVP 不包含
- 金流、諮商紀錄、線上諮商、改期（以「取消＋重新預約」代替）、多語系、多診所

## 2. 技術架構

```
Cloudflare Worker（Static Assets + API，以 cf CLI 與 cloudflare.config.ts 管理）
├─ 前端：React + Vite（@cloudflare/vite-plugin），前台／後台以 route 層級 code-split
├─ API：Hono + Zod（schema 前後端共用）
├─ DB：D1 + Drizzle ORM，mock 資料以 seed 匯入
├─ 驗證：自建帳號（PBKDF2 via WebCrypto）＋ D1 session，HttpOnly cookie
├─ 防濫用：Turnstile
├─ 通知：notifications outbox 表 + ctx.waitUntil 立即嘗試 + Cron Trigger 重試
└─ 部署：workers.dev 或自訂網域
```

### 目錄結構（單一 package）
```
src/
  client/        # React 前端（public/、admin/ 兩組 routes）
  worker/        # Hono API、cron handler
    notify/      # provider 抽象：resend | webhook | console
  shared/        # Zod schemas、型別、時段計算等純函式
migrations/      # D1 migrations
seed/            # mock 心理師、空間、時段
docs/
```

## 3. 預約流程與狀態

```
          (Turnstile + 送出)
               │
               ▼
  ┌──── auto ──┴── manual ────┐
  ▼                           ▼
confirmed ◄──── 確認 ──── pending ──── 拒絕 / 逾時 ───► rejected / expired
  │
  ├── 個案取消（符合規則）／後台取消 ───► cancelled
  └── 時間過後（後台標記，非 MVP 必要）──► completed / no_show
```

- `pending` 與 `confirmed` 都會占用時段，避免確認期間被他人預約
- `manual` 模式下，`pending` 超過 `pending_expire_hours` 未處理 → Cron 標記為 `expired` 並通知個案

**Email 驗證**：送出後狀態為 `unverified`，個案須在 `verificationHoldMinutes`（預設 15 分鐘）內打開確認信中的連結，
並在管理頁按下「確認預約」（POST，避免信箱的連結掃描器自動驗證），才進入 `pending` 或 `confirmed`；
逾時由 Cron 標記為 `expired`，新預約遇到同時段已逾時的保留也會先釋出。可在後台以 `requireEmailVerification` 關閉。
需要驗證時，建立預約的 API 不回傳 token，管理連結只寄到信箱。

**管理連結**：每筆預約一個隨機 token（DB 只存 SHA-256），連結為 `/booking#t=<token>`；token 放在 fragment，
不會出現在伺服器請求紀錄，API 一律以 POST body 傳遞。

### Public API（`/api/public`）

| Method | Path | 說明 |
|---|---|---|
| GET | `/availability?counselor=&from=&days=` | 可預約時段（最多 31 天），每個時段列出可用空間 |
| GET | `/config` | 前端設定（Turnstile site key） |
| POST | `/bookings` | 建立預約；時段已被占用回 409 |
| POST | `/bookings/lookup` | `{ token }` 查詢預約 |
| POST | `/bookings/verify` | `{ token }` email 驗證 |
| POST | `/bookings/cancel` | `{ token }` 個案取消（須在取消期限前；未驗證的預約隨時可取消且不寄信） |
| POST | `/bookings/ics` | `{ token }` 下載 `.ics` |

## 4. 時段模型

- 全域設定：`slot_duration_minutes`（如 50）、`slot_interval_minutes`（如 60）、`timezone`（`Asia/Taipei`）
- 心理師可預約時段 = 每週規則（`availability_rules`） − 例外封鎖 ＋ 例外加開（`availability_exceptions`）
- 空間可用 = 空間開放時間 − 空間封鎖 − 已被占用
- 可預約 slot = 心理師可用 ∩ 至少一個（該心理師可使用的）空間可用 ∩ 符合 `min_lead_hours` / `max_advance_days`
- 時間一律以 UTC ISO 字串存 D1，前端依 `timezone` 顯示

### 防重複預約
固定時段 + partial unique index（SQLite 支援）：
```sql
CREATE UNIQUE INDEX uq_booking_counselor_slot ON bookings (counselor_id, start_at)
  WHERE status IN ('unverified', 'pending', 'confirmed');
CREATE UNIQUE INDEX uq_booking_room_slot ON bookings (room_id, start_at)
  WHERE status IN ('unverified', 'pending', 'confirmed');
```
插入失敗即回 409「此時段剛被預約」。

## 5. 資料模型

| 表 | 主要欄位 |
|---|---|
| `counselors` | id, name, title, bio, photo_url, email, is_active, sort_order |
| `rooms` | id, name, description, capacity, photo_url, is_active, sort_order |
| `counselor_rooms` | counselor_id, room_id（限制心理師可使用的空間；無資料則全部可用） |
| `room_hours` | room_id, weekday, start_time, end_time |
| `availability_rules` | id, counselor_id, weekday, start_time, end_time, effective_from, effective_to |
| `availability_exceptions` | id, counselor_id?, room_id?, date, start_time?, end_time?, kind(`block`/`extra`), reason |
| `bookings` | id, counselor_id, room_id, start_at, end_at, status, client_name, client_email, client_phone?, manage_token_hash, hold_expires_at, ics_sequence, created_at, confirmed_at, cancelled_at, cancelled_by(`client`/`staff`), cancel_reason |
| `users` | id, email, password_hash, role(`admin`/`counselor`), counselor_id?, is_active |
| `sessions` | id_hash, user_id, expires_at |
| `auth_tokens` | token_hash, user_id, purpose(`password_setup`/`password_reset`), expires_at, used_at |
| `settings` | key, value(JSON) |
| `notifications` | id, booking_id, channel(`email`/`webhook`), recipient, template, status(`queued`/`sent`/`failed`), attempts, next_attempt_at, last_error, idempotency_key |
| `audit_logs` | id, actor_user_id?, action, target, created_at（後台操作紀錄） |

- Token（管理連結、驗證連結、session）只存 SHA-256 雜湊
- 個資最小化：不收集「諮商原因」；如需備註欄，僅後台可見，且不放進通知內容

## 6. 後台設定（`settings`）

| key | 說明 | 預設 |
|---|---|---|
| `confirmation_mode` | `auto` / `manual` | `manual` |
| `pending_expire_hours` | manual 模式未處理逾時 | 48 |
| `require_email_verification` | 是否需 email 驗證 | `true` |
| `client_cancel_cutoff_hours` | 開始前幾小時內不可自行取消 | 24 |
| `min_lead_hours` / `max_advance_days` | 最短提前／最遠可預約 | 12 / 60 |
| `slot_duration_minutes` / `slot_interval_minutes` | 時段長度／間隔 | 50 / 60 |
| `timezone` | 診所時區 | `Asia/Taipei` |
| `reminder_hours_before` | 提醒信（Cron） | 24 |
| `clinic_name` / `clinic_address` / `contact_info` | 顯示與通知用 | — |

## 7. 通知

| 事件 | 個案 | 心理師 | Webhook |
|---|---|---|---|
| 送出（manual：待確認） | ✅ | ✅（需處理） | ✅ |
| 已確認 | ✅（附 .ics） | ✅（附 .ics） | ✅ |
| 拒絕／逾時 | ✅ | — | ✅ |
| 取消 | ✅（.ics METHOD:CANCEL） | ✅ | ✅ |
| 提醒 | ✅ | ✅ | — |

- Provider 由環境變數 `EMAIL_PROVIDER=resend|console|none` 決定；`RESEND_API_KEY`、`EMAIL_FROM`
- Resend 未驗證網域時只能寄給帳號本人 → 開源無網域者使用 `webhook` 或 `console`
- Outbox：通知與預約狀態變更在同一個 D1 batch 寫入 `notifications`，回應後以 `waitUntil` 寄送，
  失敗由 Cron 重試（1 分、5 分、30 分、2 小時、6 小時後標記 `failed`）；寄出後清除 payload 內容
- 重試使用 Resend `Idempotency-Key`（= notification id），避免重複寄送
- Webhook：通用 JSON + `X-Signature: sha256=HMAC(body)`；payload 不含個案聯絡資料

## 8. 加入日曆
- 管理頁可下載 `.ics`（`POST /api/public/bookings/ics`，UID 固定，取消時遞增 `SEQUENCE`）並提供 Google Calendar `render?action=TEMPLATE` 連結
- 確認信與取消信附 `.ics` 附件（取消時 `METHOD:CANCEL`）

## 9. 已確認的決策
1. 預設需要 email 驗證（可於後台關閉）
2. `confirmationMode` MVP 僅做全域設定
3. 心理師帳號由管理員建立後，系統寄出「設定密碼」連結（`auth_tokens`）
4. 後台可設定心理師與空間的綁定（`counselor_rooms`）
