CREATE TABLE `admin` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`password` varchar(255) NOT NULL,
	`is_first_login` tinyint NOT NULL DEFAULT 1,
	`login_fail_count` tinyint unsigned NOT NULL DEFAULT 0,
	`locked_until` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `admin_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `announcement` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(100) NOT NULL,
	`content` text NOT NULL,
	`status` tinyint NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `announcement_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `announcement_read` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`announcement_id` bigint unsigned NOT NULL,
	`user_type` tinyint NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `announcement_read_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_announcement_user` UNIQUE(`announcement_id`,`user_type`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `assistant` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`account` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`creator_teacher_id` bigint unsigned NOT NULL,
	`is_first_login` tinyint NOT NULL DEFAULT 1,
	`status` tinyint NOT NULL DEFAULT 1,
	`login_fail_count` tinyint unsigned NOT NULL DEFAULT 0,
	`locked_until` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `assistant_id` PRIMARY KEY(`id`),
	CONSTRAINT `assistant_account_unique` UNIQUE(`account`)
);
--> statement-breakpoint
CREATE TABLE `assistant_class` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`assistant_id` bigint unsigned NOT NULL,
	`class_id` bigint unsigned NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `assistant_class_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_assistant_class` UNIQUE(`assistant_id`,`class_id`)
);
--> statement-breakpoint
CREATE TABLE `class` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`semester_id` bigint unsigned NOT NULL,
	`teacher_id` bigint unsigned NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `class_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `experiment` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`task_id` bigint unsigned NOT NULL,
	`current_stage` tinyint NOT NULL DEFAULT 0,
	`status` tinyint NOT NULL DEFAULT 0,
	`questionnaire` json,
	`sample_plan` json,
	`sampling_results` json,
	`sampling_data_path` varchar(500),
	`report_content` text,
	`stage1_completed_at` datetime,
	`stage2_completed_at` datetime,
	`stage3_completed_at` datetime,
	`stage4_completed_at` datetime,
	`last_saved_at` datetime,
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `experiment_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_student_task` UNIQUE(`student_id`,`task_id`)
);
--> statement-breakpoint
CREATE TABLE `login_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_type` tinyint NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`login_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`ip_address` varchar(45),
	`user_agent` varchar(500),
	CONSTRAINT `login_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`receiver_type` tinyint NOT NULL,
	`receiver_id` bigint unsigned NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`related_type` varchar(50),
	`related_id` bigint unsigned,
	`is_read` tinyint NOT NULL DEFAULT 0,
	`read_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operation_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_type` tinyint NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` bigint unsigned,
	`detail` json,
	`ip_address` varchar(45),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `operation_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `semester` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(20) NOT NULL,
	`is_current` tinyint NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `semester_id` PRIMARY KEY(`id`),
	CONSTRAINT `semester_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `student` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`class_id` bigint unsigned NOT NULL,
	`is_first_login` tinyint NOT NULL DEFAULT 1,
	`status` tinyint NOT NULL DEFAULT 1,
	`login_fail_count` tinyint unsigned NOT NULL DEFAULT 0,
	`locked_until` datetime,
	`deleted_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `student_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_student_id_unique` UNIQUE(`student_id`)
);
--> statement-breakpoint
CREATE TABLE `student_transfer` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`from_class_id` bigint unsigned NOT NULL,
	`to_class_id` bigint unsigned NOT NULL,
	`reason` varchar(500),
	`operated_by` bigint unsigned NOT NULL,
	`transferred_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `student_transfer_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submission` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`experiment_id` bigint unsigned NOT NULL,
	`questionnaire_pdf_path` varchar(500),
	`report_pdf_path` varchar(500),
	`score_questionnaire` decimal(5,2),
	`score_process` decimal(5,2),
	`score_report` decimal(5,2),
	`total_score` decimal(5,2),
	`teacher_comment` text,
	`reject_reason` text,
	`status` tinyint NOT NULL DEFAULT 1,
	`graded_by_type` tinyint,
	`graded_by_id` bigint unsigned,
	`locked_by_type` tinyint,
	`locked_by_id` bigint unsigned,
	`locked_at` datetime,
	`submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`graded_at` datetime,
	CONSTRAINT `submission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`config_key` varchar(100) NOT NULL,
	`config_value` text NOT NULL,
	`value_type` varchar(20) NOT NULL DEFAULT 'string',
	`description` varchar(500),
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_config_key_unique` UNIQUE(`config_key`)
);
--> statement-breakpoint
CREATE TABLE `system_metrics` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`metric_type` varchar(50) NOT NULL,
	`metric_value` decimal(10,2) NOT NULL,
	`recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `system_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`topic_id` bigint unsigned NOT NULL,
	`class_id` bigint unsigned NOT NULL,
	`open_time` datetime,
	`deadline` datetime,
	`deleted_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `task_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_topic_class` UNIQUE(`topic_id`,`class_id`)
);
--> statement-breakpoint
CREATE TABLE `teacher` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`is_first_login` tinyint NOT NULL DEFAULT 1,
	`status` tinyint NOT NULL DEFAULT 1,
	`login_fail_count` tinyint unsigned NOT NULL DEFAULT 0,
	`locked_until` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_employee_id_unique` UNIQUE(`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `topic` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`teacher_id` bigint unsigned NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`excel_file_path` varchar(500),
	`excel_row_count` int unsigned DEFAULT 0,
	`field_mapping` json,
	`weight_config` json,
	`status` tinyint NOT NULL DEFAULT 0,
	`is_deleted` tinyint NOT NULL DEFAULT 0,
	`locked_by` bigint unsigned,
	`locked_at` datetime,
	`deleted_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `topic_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topic_attachment` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`topic_id` bigint unsigned NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`file_type` varchar(50) NOT NULL,
	`file_size` bigint unsigned NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `topic_attachment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topic_recommend_question` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`topic_id` bigint unsigned NOT NULL,
	`question_type` tinyint NOT NULL,
	`content` varchar(500) NOT NULL,
	`options` json,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `topic_recommend_question_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_session` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`session_token` varchar(128) NOT NULL,
	`user_type` tinyint NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`device_info` varchar(500),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	`last_active_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_session_session_token_unique` UNIQUE(`session_token`)
);
--> statement-breakpoint
CREATE INDEX `idx_status` ON `announcement` (`status`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `announcement_read` (`user_type`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `assistant` (`status`);--> statement-breakpoint
CREATE INDEX `idx_creator_teacher_id` ON `assistant` (`creator_teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_class_id` ON `assistant_class` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_semester_id` ON `class` (`semester_id`);--> statement-breakpoint
CREATE INDEX `idx_teacher_id` ON `class` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_task_id` ON `experiment` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `experiment` (`status`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `login_log` (`user_type`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_login_at` ON `login_log` (`login_at`);--> statement-breakpoint
CREATE INDEX `idx_receiver` ON `notification` (`receiver_type`,`receiver_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `notification` (`type`);--> statement-breakpoint
CREATE INDEX `idx_created` ON `notification` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `operation_log` (`user_type`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_action` ON `operation_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_created_at` ON `operation_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_class_id` ON `student` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `student` (`status`);--> statement-breakpoint
CREATE INDEX `idx_deleted` ON `student` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_student` ON `student_transfer` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_from_class` ON `student_transfer` (`from_class_id`);--> statement-breakpoint
CREATE INDEX `idx_to_class` ON `student_transfer` (`to_class_id`);--> statement-breakpoint
CREATE INDEX `idx_experiment_id` ON `submission` (`experiment_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `submission` (`status`);--> statement-breakpoint
CREATE INDEX `idx_locked` ON `submission` (`locked_at`);--> statement-breakpoint
CREATE INDEX `idx_type_time` ON `system_metrics` (`metric_type`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_class_id` ON `task` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_deleted` ON `task` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `teacher` (`status`);--> statement-breakpoint
CREATE INDEX `idx_teacher_id` ON `topic` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `topic` (`status`);--> statement-breakpoint
CREATE INDEX `idx_deleted` ON `topic` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_topic_id` ON `topic_attachment` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_topic_id` ON `topic_recommend_question` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `user_session` (`user_type`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_expires` ON `user_session` (`expires_at`);