import { z } from "zod";

// 前後端共用的預約表單驗證
export const createBookingSchema = z.object({
	counselorId: z.string().min(1),
	roomId: z.string().min(1),
	startAt: z.iso.datetime(),
	clientName: z.string().trim().min(1, "請填寫姓名").max(50, "姓名最多 50 個字"),
	clientEmail: z.email("Email 格式不正確").max(254),
	clientPhone: z
		.string()
		.trim()
		.regex(/^[0-9+\-\s()#]{6,20}$/, "電話格式不正確")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	turnstileToken: z.string().optional(),
});
export type CreateBookingRequest = z.input<typeof createBookingSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(100) });
