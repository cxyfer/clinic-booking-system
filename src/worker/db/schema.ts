import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	ACTIVE_BOOKING_STATUSES,
	BOOKING_STATUSES,
	EXCEPTION_KINDS,
	NOTIFICATION_CHANNELS,
	NOTIFICATION_STATUSES,
	TOKEN_PURPOSES,
	USER_ROLES,
} from "../../shared/constants";

// 時間欄位一律存 UTC ISO 8601 字串（例：2026-11-04T06:00:00.000Z），可直接字串比較
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(now);
const updatedAt = () => text("updated_at").notNull().default(now);

// 牆上時間（診所時區），格式 HH:MM
const wallTime = (name: string) => text(name);

const activeStatusList = sql.raw(
	ACTIVE_BOOKING_STATUSES.map((s) => `'${s}'`).join(", "),
);

export const counselors = sqliteTable("counselors", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	title: text("title"),
	bio: text("bio"),
	photoUrl: text("photo_url"),
	// 通知寄送對象
	email: text("email").notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const rooms = sqliteTable("rooms", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	capacity: integer("capacity"),
	photoUrl: text("photo_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

// 心理師可使用的空間；某心理師沒有任何紀錄時視為全部空間皆可用
export const counselorRooms = sqliteTable(
	"counselor_rooms",
	{
		counselorId: text("counselor_id")
			.notNull()
			.references(() => counselors.id, { onDelete: "cascade" }),
		roomId: text("room_id")
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.counselorId, t.roomId] })],
);

// 空間每週開放時間
export const roomHours = sqliteTable(
	"room_hours",
	{
		id: text("id").primaryKey(),
		roomId: text("room_id")
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
		// 0 = 週日 … 6 = 週六
		weekday: integer("weekday").notNull(),
		startTime: wallTime("start_time").notNull(),
		endTime: wallTime("end_time").notNull(),
	},
	(t) => [
		index("idx_room_hours_room").on(t.roomId),
		check("chk_room_hours_weekday", sql`${t.weekday} BETWEEN 0 AND 6`),
		check("chk_room_hours_range", sql`${t.startTime} < ${t.endTime}`),
	],
);

// 心理師每週可預約時段
export const availabilityRules = sqliteTable(
	"availability_rules",
	{
		id: text("id").primaryKey(),
		counselorId: text("counselor_id")
			.notNull()
			.references(() => counselors.id, { onDelete: "cascade" }),
		weekday: integer("weekday").notNull(),
		startTime: wallTime("start_time").notNull(),
		endTime: wallTime("end_time").notNull(),
		// 診所時區日期 YYYY-MM-DD，null 表示不限
		effectiveFrom: text("effective_from"),
		effectiveTo: text("effective_to"),
		createdAt: createdAt(),
	},
	(t) => [
		index("idx_availability_rules_counselor").on(t.counselorId),
		check("chk_availability_weekday", sql`${t.weekday} BETWEEN 0 AND 6`),
		check("chk_availability_range", sql`${t.startTime} < ${t.endTime}`),
	],
);

// 例外：封鎖（請假、空間維修）或加開時段；counselor_id 與 room_id 擇一
export const availabilityExceptions = sqliteTable(
	"availability_exceptions",
	{
		id: text("id").primaryKey(),
		counselorId: text("counselor_id").references(() => counselors.id, {
			onDelete: "cascade",
		}),
		roomId: text("room_id").references(() => rooms.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		// 皆為 null 表示整天
		startTime: wallTime("start_time"),
		endTime: wallTime("end_time"),
		kind: text("kind", { enum: EXCEPTION_KINDS }).notNull(),
		reason: text("reason"),
		createdAt: createdAt(),
	},
	(t) => [
		index("idx_exceptions_counselor_date").on(t.counselorId, t.date),
		index("idx_exceptions_room_date").on(t.roomId, t.date),
		check(
			"chk_exceptions_target",
			sql`(${t.counselorId} IS NULL) <> (${t.roomId} IS NULL)`,
		),
	],
);

export const bookings = sqliteTable(
	"bookings",
	{
		id: text("id").primaryKey(),
		counselorId: text("counselor_id")
			.notNull()
			.references(() => counselors.id),
		roomId: text("room_id")
			.notNull()
			.references(() => rooms.id),
		startAt: text("start_at").notNull(),
		endAt: text("end_at").notNull(),
		status: text("status", { enum: BOOKING_STATUSES }).notNull(),
		clientName: text("client_name").notNull(),
		clientEmail: text("client_email").notNull(),
		clientPhone: text("client_phone"),
		// 僅後台可見，不放入通知內容
		staffNote: text("staff_note"),
		// 管理連結 token，只存 SHA-256 雜湊；email 驗證也使用同一個連結
		manageTokenHash: text("manage_token_hash").notNull(),
		// unverified 狀態的保留期限
		holdExpiresAt: text("hold_expires_at"),
		// .ics 更新時遞增
		icsSequence: integer("ics_sequence").notNull().default(0),
		verifiedAt: text("verified_at"),
		confirmedAt: text("confirmed_at"),
		cancelledAt: text("cancelled_at"),
		cancelledBy: text("cancelled_by", { enum: ["client", "staff", "system"] }),
		cancelReason: text("cancel_reason"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		// 防止重複預約：同一心理師／空間在同一時段只能有一筆有效預約
		uniqueIndex("uq_bookings_counselor_slot")
			.on(t.counselorId, t.startAt)
			.where(sql`${t.status} IN (${activeStatusList})`),
		uniqueIndex("uq_bookings_room_slot")
			.on(t.roomId, t.startAt)
			.where(sql`${t.status} IN (${activeStatusList})`),
		uniqueIndex("uq_bookings_manage_token").on(t.manageTokenHash),
		index("idx_bookings_start").on(t.startAt),
		index("idx_bookings_status").on(t.status),
		check("chk_bookings_range", sql`${t.startAt} < ${t.endAt}`),
	],
);

export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		email: text("email").notNull(),
		// 尚未設定密碼前為 null
		passwordHash: text("password_hash"),
		role: text("role", { enum: USER_ROLES }).notNull(),
		counselorId: text("counselor_id").references(() => counselors.id, {
			onDelete: "set null",
		}),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		lastLoginAt: text("last_login_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		uniqueIndex("uq_users_email").on(sql`lower(${t.email})`),
		uniqueIndex("uq_users_counselor").on(t.counselorId),
	],
);

export const sessions = sqliteTable(
	"sessions",
	{
		idHash: text("id_hash").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: text("expires_at").notNull(),
		createdAt: createdAt(),
	},
	(t) => [index("idx_sessions_user").on(t.userId)],
);

// 設定密碼／重設密碼連結
export const authTokens = sqliteTable(
	"auth_tokens",
	{
		tokenHash: text("token_hash").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		purpose: text("purpose", { enum: TOKEN_PURPOSES }).notNull(),
		expiresAt: text("expires_at").notNull(),
		usedAt: text("used_at"),
		createdAt: createdAt(),
	},
	(t) => [index("idx_auth_tokens_user").on(t.userId)],
);

// key-value 設定，value 為 JSON
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }).notNull(),
	updatedAt: updatedAt(),
});

// 通知 outbox：與預約變更同一個 batch 寫入，由 waitUntil / cron 送出
export const notifications = sqliteTable(
	"notifications",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id").references(() => bookings.id, {
			onDelete: "set null",
		}),
		channel: text("channel", { enum: NOTIFICATION_CHANNELS }).notNull(),
		recipient: text("recipient").notNull(),
		template: text("template").notNull(),
		payload: text("payload", { mode: "json" }).notNull(),
		status: text("status", { enum: NOTIFICATION_STATUSES })
			.notNull()
			.default("queued"),
		attempts: integer("attempts").notNull().default(0),
		nextAttemptAt: text("next_attempt_at").notNull().default(now),
		lastError: text("last_error"),
		sentAt: text("sent_at"),
		createdAt: createdAt(),
	},
	(t) => [
		index("idx_notifications_due").on(t.status, t.nextAttemptAt),
		index("idx_notifications_booking").on(t.bookingId),
	],
);

export const auditLogs = sqliteTable(
	"audit_logs",
	{
		id: text("id").primaryKey(),
		actorUserId: text("actor_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		action: text("action").notNull(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id"),
		detail: text("detail", { mode: "json" }),
		createdAt: createdAt(),
	},
	(t) => [index("idx_audit_logs_created").on(t.createdAt)],
);
