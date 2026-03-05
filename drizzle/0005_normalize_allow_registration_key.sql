INSERT INTO `system_config` (`config_key`, `config_value`, `value_type`, `description`)
SELECT 'allow_registration', legacy.`config_value`, legacy.`value_type`, legacy.`description`
FROM `system_config` AS legacy
WHERE legacy.`config_key` = 'allow_student_login'
  AND NOT EXISTS (
    SELECT 1
    FROM `system_config`
    WHERE `config_key` = 'allow_registration'
  );
--> statement-breakpoint
DELETE FROM `system_config`
WHERE `config_key` = 'allow_student_login';
