CREATE TABLE `diagnostic_quiz_answers` (
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_option` integer NOT NULL,
	`is_correct` integer NOT NULL,
	PRIMARY KEY(`attempt_id`, `question_id`),
	FOREIGN KEY (`attempt_id`) REFERENCES `diagnostic_quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `diagnostic_quiz_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `diagnostic_quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_fingerprint` text NOT NULL,
	`grade` text NOT NULL,
	`exam_date` text NOT NULL,
	`status` text NOT NULL,
	`score` integer,
	`total` integer NOT NULL,
	`model` text NOT NULL,
	`coverage_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_quiz_attempts_user_created` ON `diagnostic_quiz_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_quiz_attempts_user_status_completed` ON `diagnostic_quiz_attempts` (`user_id`,`status`,`completed_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_quiz_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`position` integer NOT NULL,
	`subject` text NOT NULL,
	`textbook` text NOT NULL,
	`unit_number` integer NOT NULL,
	`knowledge_point` text NOT NULL,
	`prompt` text NOT NULL,
	`options_json` text NOT NULL,
	`correct_option` integer NOT NULL,
	`explanation` text NOT NULL,
	`difficulty` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `diagnostic_quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnostic_quiz_questions_attempt_position_unique` ON `diagnostic_quiz_questions` (`attempt_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_quiz_questions_attempt` ON `diagnostic_quiz_questions` (`attempt_id`);