CREATE TABLE `daily_feedbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feedback_date` text NOT NULL,
	`status` text NOT NULL,
	`base_plan_id` text,
	`base_plan_updated_at` integer,
	`energy_level` integer NOT NULL,
	`focus_level` integer NOT NULL,
	`actual_study_minutes` integer,
	`quick_selections_json` text NOT NULL,
	`difficulty_notes` text NOT NULL,
	`incomplete_reason` text NOT NULL,
	`unclear_knowledge` text NOT NULL,
	`tomorrow_changes` text NOT NULL,
	`tomorrow_priority` text NOT NULL,
	`additional_notes` text NOT NULL,
	`system_context_json` text NOT NULL,
	`ai_summary_json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_feedbacks_user_date_unique` ON `daily_feedbacks` (`user_id`,`feedback_date`);--> statement-breakpoint
CREATE INDEX `idx_daily_feedbacks_user_updated` ON `daily_feedbacks` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `feedback_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`user_id` text NOT NULL,
	`base_plan_id` text,
	`base_plan_updated_at` integer,
	`operation` text NOT NULL,
	`task_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`reason` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`decision` text NOT NULL,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `daily_feedbacks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_adjustments_feedback` ON `feedback_adjustments` (`feedback_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_feedback_adjustments_user_decision` ON `feedback_adjustments` (`user_id`,`decision`);