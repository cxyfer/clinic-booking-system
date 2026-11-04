-- Mock 資料（僅供本地開發／Demo）；INSERT OR IGNORE 可重複執行
INSERT OR IGNORE INTO counselors (id, name, title, bio, email, sort_order) VALUES
	('co_lin',  '林予安', '諮商心理師', '專長：焦慮與情緒調節、職場壓力、伴侶關係。', 'lin@example.com', 1),
	('co_chen', '陳思遠', '臨床心理師', '專長：失眠、創傷復原、正念減壓。', 'chen@example.com', 2),
	('co_wang', '王若晴', '諮商心理師', '專長：兒童與青少年、遊戲治療、親職諮詢。', 'wang@example.com', 3);

INSERT OR IGNORE INTO rooms (id, name, description, capacity, sort_order) VALUES
	('rm_forest', '森林室', '溫暖木質調，適合個別諮商。', 2, 1),
	('rm_ocean',  '海洋室', '寬敞明亮，可進行伴侶／家庭諮商。', 4, 2),
	('rm_play',   '遊戲室', '備有沙盤與玩具，適合兒童遊戲治療。', 3, 3);

-- 王若晴只使用遊戲室與森林室；其他心理師未設定 = 可使用全部空間
INSERT OR IGNORE INTO counselor_rooms (counselor_id, room_id) VALUES
	('co_wang', 'rm_play'),
	('co_wang', 'rm_forest');

-- 空間開放時間：週一至週六 09:00–21:00
INSERT OR IGNORE INTO room_hours (id, room_id, weekday, start_time, end_time)
SELECT 'rh_' || r.id || '_' || d.value, r.id, d.value, '09:00', '21:00'
FROM rooms r, json_each('[1,2,3,4,5,6]') d
WHERE r.id IN ('rm_forest', 'rm_ocean', 'rm_play');

-- 心理師每週時段
INSERT OR IGNORE INTO availability_rules (id, counselor_id, weekday, start_time, end_time) VALUES
	('ar_lin_1',  'co_lin',  1, '10:00', '17:00'),
	('ar_lin_3',  'co_lin',  3, '10:00', '17:00'),
	('ar_lin_5',  'co_lin',  5, '14:00', '21:00'),
	('ar_chen_2', 'co_chen', 2, '09:00', '12:00'),
	('ar_chen_4', 'co_chen', 4, '13:00', '21:00'),
	('ar_chen_6', 'co_chen', 6, '09:00', '15:00'),
	('ar_wang_3', 'co_wang', 3, '14:00', '19:00'),
	('ar_wang_6', 'co_wang', 6, '09:00', '17:00');

-- 診所資訊（mock）
INSERT OR IGNORE INTO settings (key, value) VALUES
	('clinicName', '"樹蔭心理諮商所"'),
	('clinicAddress', '"台北市大安區示範路 1 號 3 樓"'),
	('contactInfo', '"電話 02-2700-0000（週一至週六 09:00–21:00）"');
