CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_name` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_label` text NOT NULL,
	`module` text NOT NULL,
	`module_label` text NOT NULL,
	`action` text NOT NULL,
	`action_label` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`reason` text NOT NULL,
	`related_object_type` text NOT NULL,
	`related_object_id` text NOT NULL,
	`related_object_label` text NOT NULL,
	`related_object_href` text NOT NULL,
	`changes_json` text NOT NULL,
	`undoable` integer NOT NULL,
	`correction_of` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_journal_entries_user_occurred` ON `journal_entries` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_journal_entries_user_module` ON `journal_entries` (`user_id`,`module`);