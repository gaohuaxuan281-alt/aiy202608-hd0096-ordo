ALTER TABLE `study_plans` ADD `parent_plan_id` text;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `source_adjustment_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `study_plans_user_parent_unique` ON `study_plans` (`user_id`,`parent_plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_plans_source_adjustment_unique` ON `study_plans` (`source_adjustment_id`);