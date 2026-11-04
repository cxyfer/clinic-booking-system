CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`detail` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_user` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `availability_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`counselor_id` text,
	`room_id` text,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`kind` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`counselor_id`) REFERENCES `counselors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_exceptions_target" CHECK(("availability_exceptions"."counselor_id" IS NULL) <> ("availability_exceptions"."room_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_exceptions_counselor_date` ON `availability_exceptions` (`counselor_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_exceptions_room_date` ON `availability_exceptions` (`room_id`,`date`);--> statement-breakpoint
CREATE TABLE `availability_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`counselor_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`effective_from` text,
	`effective_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`counselor_id`) REFERENCES `counselors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_availability_weekday" CHECK("availability_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "chk_availability_range" CHECK("availability_rules"."start_time" < "availability_rules"."end_time")
);
--> statement-breakpoint
CREATE INDEX `idx_availability_rules_counselor` ON `availability_rules` (`counselor_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`counselor_id` text NOT NULL,
	`room_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`status` text NOT NULL,
	`client_name` text NOT NULL,
	`client_email` text NOT NULL,
	`client_phone` text,
	`staff_note` text,
	`manage_token_hash` text NOT NULL,
	`verify_token_hash` text,
	`hold_expires_at` text,
	`ics_sequence` integer DEFAULT 0 NOT NULL,
	`verified_at` text,
	`confirmed_at` text,
	`cancelled_at` text,
	`cancelled_by` text,
	`cancel_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`counselor_id`) REFERENCES `counselors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_bookings_range" CHECK("bookings"."start_at" < "bookings"."end_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bookings_counselor_slot` ON `bookings` (`counselor_id`,`start_at`) WHERE "bookings"."status" IN ('unverified', 'pending', 'confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bookings_room_slot` ON `bookings` (`room_id`,`start_at`) WHERE "bookings"."status" IN ('unverified', 'pending', 'confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bookings_manage_token` ON `bookings` (`manage_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_bookings_start` ON `bookings` (`start_at`);--> statement-breakpoint
CREATE INDEX `idx_bookings_status` ON `bookings` (`status`);--> statement-breakpoint
CREATE TABLE `counselor_rooms` (
	`counselor_id` text NOT NULL,
	`room_id` text NOT NULL,
	PRIMARY KEY(`counselor_id`, `room_id`),
	FOREIGN KEY (`counselor_id`) REFERENCES `counselors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `counselors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`bio` text,
	`photo_url` text,
	`email` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`template` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_error` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_due` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_booking` ON `notifications` (`booking_id`);--> statement-breakpoint
CREATE TABLE `room_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_room_hours_weekday" CHECK("room_hours"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "chk_room_hours_range" CHECK("room_hours"."start_time" < "room_hours"."end_time")
);
--> statement-breakpoint
CREATE INDEX `idx_room_hours_room` ON `room_hours` (`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`capacity` integer,
	`photo_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`role` text NOT NULL,
	`counselor_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`counselor_id`) REFERENCES `counselors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_counselor` ON `users` (`counselor_id`);