ALTER TABLE `submission` ADD `pdf_snapshot_questionnaire` json;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_snapshot_report_content` text;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_snapshot_topic_name` varchar(200);--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_snapshot_student_name` varchar(100);--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_status` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_generation_attempts` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_last_attempt_at` datetime;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_generated_at` datetime;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_error` varchar(500);--> statement-breakpoint
UPDATE `submission`
SET
    `pdf_status` = CASE
        WHEN `questionnaire_pdf_path` IS NOT NULL AND `report_pdf_path` IS NOT NULL THEN 2
        ELSE 3
    END,
    `pdf_generation_attempts` = CASE
        WHEN `questionnaire_pdf_path` IS NOT NULL AND `report_pdf_path` IS NOT NULL THEN 1
        ELSE 0
    END,
    `pdf_last_attempt_at` = NULL,
    `pdf_generated_at` = CASE
        WHEN `questionnaire_pdf_path` IS NOT NULL AND `report_pdf_path` IS NOT NULL THEN `submitted_at`
        ELSE NULL
    END,
    `pdf_error` = CASE
        WHEN `questionnaire_pdf_path` IS NOT NULL AND `report_pdf_path` IS NOT NULL THEN NULL
        ELSE '历史提交未保存 PDF 快照，无法自动重建。'
    END;--> statement-breakpoint
CREATE INDEX `idx_pdf_status_attempt` ON `submission` (`pdf_status`,`pdf_last_attempt_at`,`id`);
