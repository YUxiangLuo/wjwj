ALTER TABLE "admin" ADD CONSTRAINT "admin_ck_username_length" CHECK (char_length("admin"."username") <= 50);--> statement-breakpoint
ALTER TABLE "assistant" ADD CONSTRAINT "assistant_ck_account_length" CHECK (char_length("assistant"."account") <= 50);--> statement-breakpoint
ALTER TABLE "semester" ADD CONSTRAINT "semester_ck_name_length" CHECK (char_length("semester"."name") <= 20);--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_ck_student_id_length" CHECK (char_length("student"."student_id") <= 50);--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_ck_config_key_length" CHECK (char_length("system_config"."config_key") <= 100);--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_ck_employee_id_length" CHECK (char_length("teacher"."employee_id") <= 50);