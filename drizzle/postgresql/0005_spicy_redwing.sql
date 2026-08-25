CREATE UNIQUE INDEX "semester_uk_single_current" ON "semester" USING btree ("is_current") WHERE "semester"."is_current" = 1;--> statement-breakpoint
ALTER TABLE "admin" ADD CONSTRAINT "admin_ck_first_login" CHECK ("admin"."is_first_login" in (0, 1));--> statement-breakpoint
ALTER TABLE "admin" ADD CONSTRAINT "admin_ck_login_fail_count" CHECK ("admin"."login_fail_count" >= 0);--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_ck_status_value" CHECK ("announcement"."status" in (0, 1));--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_version" CHECK ("experiment"."version" >= 1);--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_current_stage" CHECK ("experiment"."current_stage" between 1 and 4);--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_score_ranges" CHECK (("experiment"."score_questionnaire" is null or "experiment"."score_questionnaire" between 0 and 100)
                and ("experiment"."score_process" is null or "experiment"."score_process" between 0 and 100)
                and ("experiment"."score_report" is null or "experiment"."score_report" between 0 and 100)
                and ("experiment"."total_score" is null or "experiment"."total_score" between 0 and 100));--> statement-breakpoint
ALTER TABLE "semester" ADD CONSTRAINT "semester_ck_is_current" CHECK ("semester"."is_current" in (0, 1));--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_ck_status_value" CHECK ("student"."status" in (0, 1));--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_ck_first_login" CHECK ("student"."is_first_login" in (0, 1));--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_ck_login_fail_count" CHECK ("student"."login_fail_count" >= 0);--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_ck_status_value" CHECK ("teacher"."status" in (0, 1));--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_ck_first_login" CHECK ("teacher"."is_first_login" in (0, 1));--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_ck_login_fail_count" CHECK ("teacher"."login_fail_count" >= 0);--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_status_value" CHECK ("topic"."status" in (0, 1));--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_excel_row_count" CHECK ("topic"."excel_row_count" between 0 and 100000);--> statement-breakpoint
ALTER TABLE "topic_attachment" ADD CONSTRAINT "topic_attachment_ck_file_size" CHECK ("topic_attachment"."file_size" >= 0);--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_ck_user_type" CHECK ("user_session"."user_type" in (1, 2, 3));