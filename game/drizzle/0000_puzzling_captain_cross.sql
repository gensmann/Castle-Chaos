CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`room_code` text NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_profiles_room` ON `profiles` (`room_code`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
