ALTER TABLE `student` ADD `email` varchar(120);--> statement-breakpoint
CREATE INDEX `idx_experiment_submitted_id` ON `submission` (`experiment_id`,`submitted_at`,`id`);