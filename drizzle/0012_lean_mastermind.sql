ALTER TABLE `study_plans` ADD `generation_key` text;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `generation_status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `lease_expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `study_plans_generation_key_unique` ON `study_plans` (`user_id`,`generation_key`);
