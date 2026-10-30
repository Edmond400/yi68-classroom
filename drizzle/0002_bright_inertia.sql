CREATE TABLE `administrator` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`credential_version` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `administrator_username_unique` ON `administrator` (`username`);--> statement-breakpoint
CREATE TABLE `administrator_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`credential_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `administrator`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_administrator_session_expiry` ON `administrator_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `birthday_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`name` text NOT NULL,
	`month` integer NOT NULL,
	`day` integer NOT NULL,
	`participation` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `birthday_responses_request_key_unique` ON `birthday_responses` (`request_key`);--> statement-breakpoint
CREATE INDEX `idx_birthday_month` ON `birthday_responses` (`month`);--> statement-breakpoint
CREATE INDEX `idx_birthday_name` ON `birthday_responses` (`name`);
