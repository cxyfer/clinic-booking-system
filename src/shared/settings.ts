import { z } from "zod";
import { CONFIRMATION_MODES } from "./constants";

// 後台可調整的全域設定；新增欄位時務必提供預設值
export const settingsSchema = z.object({
	confirmationMode: z.enum(CONFIRMATION_MODES).default("manual"),
	pendingExpireHours: z.number().int().min(1).default(48),
	requireEmailVerification: z.boolean().default(true),
	verificationHoldMinutes: z.number().int().min(5).default(15),
	clientCancelCutoffHours: z.number().int().min(0).default(24),
	minLeadHours: z.number().int().min(0).default(12),
	maxAdvanceDays: z.number().int().min(1).default(60),
	slotDurationMinutes: z.number().int().min(10).default(50),
	slotIntervalMinutes: z.number().int().min(10).default(60),
	reminderHoursBefore: z.number().int().min(0).default(24),
	timezone: z.string().default("Asia/Taipei"),
	clinicName: z.string().default("示範諮商所"),
	clinicAddress: z.string().default(""),
	contactInfo: z.string().default(""),
});
export type Settings = z.infer<typeof settingsSchema>;

// 前台可見的設定子集
export const PUBLIC_SETTING_KEYS = [
	"confirmationMode",
	"requireEmailVerification",
	"clientCancelCutoffHours",
	"minLeadHours",
	"maxAdvanceDays",
	"slotDurationMinutes",
	"timezone",
	"clinicName",
	"clinicAddress",
	"contactInfo",
] as const satisfies readonly (keyof Settings)[];
export type PublicSettings = Pick<Settings, (typeof PUBLIC_SETTING_KEYS)[number]>;
