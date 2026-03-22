ALTER TABLE `topic_recommend_question` DROP COLUMN `options`;
--> statement-breakpoint
ALTER TABLE `topic_recommend_question`
	ADD `choice_options` json,
	ADD `min_select` tinyint unsigned,
	ADD `max_select` tinyint unsigned,
	ADD `scale_min` tinyint unsigned,
	ADD `scale_max` tinyint unsigned,
	ADD `scale_min_label` varchar(50),
	ADD `scale_max_label` varchar(50);
