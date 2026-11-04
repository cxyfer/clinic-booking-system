export const BOOKING_STATUSES = [
	// 等待個案點擊 email 驗證連結
	"unverified",
	// 等待心理師／管理員確認（manual 模式）
	"pending",
	"confirmed",
	"cancelled",
	"rejected",
	// 未驗證或未確認而逾時
	"expired",
	"completed",
	"no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// 會占用時段的狀態
export const ACTIVE_BOOKING_STATUSES = [
	"unverified",
	"pending",
	"confirmed",
] as const satisfies readonly BookingStatus[];

export const USER_ROLES = ["admin", "counselor"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EXCEPTION_KINDS = ["block", "extra"] as const;

export const TOKEN_PURPOSES = ["password_setup", "password_reset"] as const;

export const NOTIFICATION_CHANNELS = ["email", "webhook"] as const;
export const NOTIFICATION_STATUSES = ["queued", "sent", "failed"] as const;

export const CONFIRMATION_MODES = ["auto", "manual"] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];
