CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_item` ON `assets` (`item_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '全班同学' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_start` ON `events` (`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_events_item` ON `events` (`item_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '待处理' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_items_public_kind` ON `items` (`published`,`kind`);--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`day` text NOT NULL,
	`summary` text NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`cooperation` text DEFAULT '' NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_progress_day` ON `progress` (`day`);--> statement-breakpoint
CREATE INDEX `idx_progress_item` ON `progress` (`item_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
