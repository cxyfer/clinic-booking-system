// 前後端共用的 API 回應型別
export interface CounselorDto {
	id: string;
	name: string;
	title: string | null;
	bio: string | null;
	photoUrl: string | null;
	roomIds: string[];
}

export interface RoomDto {
	id: string;
	name: string;
	description: string | null;
	capacity: number | null;
	photoUrl: string | null;
}

export interface ApiError {
	error: { code: string; message: string };
}

export interface AvailabilityDto {
	timezone: string;
	from: string;
	to: string;
	slots: import("./slots").Slot[];
}

export interface BookingDto {
	id: string;
	status: import("./constants").BookingStatus;
	startAt: string;
	endAt: string;
	counselor: { id: string; name: string };
	room: { id: string; name: string };
	clientName: string;
	// unverified 狀態的確認期限
	holdExpiresAt: string | null;
	// 個案可自行取消的期限；null 表示隨時可取消
	cancelDeadline: string | null;
	canCancel: boolean;
	icsSequence: number;
}

export interface CreateBookingResponse {
	booking: BookingDto;
	// 只在建立當下回傳一次，用於導向管理頁；需要 email 驗證時為 null（連結只寄到信箱）
	token: string | null;
}

export interface PublicConfig {
	// 未設定時前端不顯示 Turnstile
	turnstileSiteKey: string | null;
}
