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
