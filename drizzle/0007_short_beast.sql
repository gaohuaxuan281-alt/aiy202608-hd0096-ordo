CREATE TABLE `study_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_name` text NOT NULL,
	`exam_date` text NOT NULL,
	`target_score` text NOT NULL,
	`input_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`model` text NOT NULL,
	`raw_response` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_study_plans_user_updated` ON `study_plans` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_study_plans_user_exam` ON `study_plans` (`user_id`,`exam_date`);