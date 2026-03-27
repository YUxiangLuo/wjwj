ALTER TABLE `submission` ADD `pdf_snapshot_sample_plan` json;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_snapshot_population_size` int unsigned;--> statement-breakpoint
ALTER TABLE `submission` ADD `pdf_snapshot_sampling_results` json;--> statement-breakpoint
UPDATE `submission` AS s
INNER JOIN `experiment` AS e ON s.`experiment_id` = e.`id`
INNER JOIN `task` AS t ON e.`task_id` = t.`id`
INNER JOIN `topic` AS tp ON t.`topic_id` = tp.`id`
SET
    s.`pdf_snapshot_sampling_results` = COALESCE(s.`pdf_snapshot_sampling_results`, e.`sampling_results`),
    s.`pdf_snapshot_sample_plan` = COALESCE(s.`pdf_snapshot_sample_plan`, e.`sample_plan`),
    s.`pdf_snapshot_population_size` = COALESCE(s.`pdf_snapshot_population_size`, tp.`excel_row_count`)
WHERE s.`pdf_snapshot_sampling_results` IS NULL
   OR s.`pdf_snapshot_sample_plan` IS NULL
   OR s.`pdf_snapshot_population_size` IS NULL;
