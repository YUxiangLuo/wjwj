CREATE TABLE "admin" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" varchar(255) NOT NULL,
	"is_first_login" smallint DEFAULT 1 NOT NULL,
	"login_fail_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "admin_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"target_scope" varchar(20) DEFAULT 'all' NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_read" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"announcement_id" bigint NOT NULL,
	"user_type" smallint NOT NULL,
	"user_id" bigint NOT NULL,
	"read_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"creator_teacher_id" bigint NOT NULL,
	"is_first_login" smallint DEFAULT 1 NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"login_fail_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "assistant_account_unique" UNIQUE("account")
);
--> statement-breakpoint
CREATE TABLE "assistant_class" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"assistant_id" bigint NOT NULL,
	"class_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"semester_id" bigint NOT NULL,
	"teacher_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" bigint NOT NULL,
	"task_id" bigint NOT NULL,
	"current_stage" smallint DEFAULT 0 NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"questionnaire" jsonb,
	"sample_plan" jsonb,
	"sampling_results" jsonb,
	"sampling_data_path" varchar(500),
	"report_content" text,
	"stage1_completed_at" timestamp,
	"stage2_completed_at" timestamp,
	"stage3_completed_at" timestamp,
	"stage4_completed_at" timestamp,
	"last_saved_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_type" smallint NOT NULL,
	"user_id" bigint NOT NULL,
	"login_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"receiver_type" smallint NOT NULL,
	"receiver_id" bigint NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"related_type" varchar(50),
	"related_id" bigint,
	"is_read" smallint DEFAULT 0 NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_type" smallint NOT NULL,
	"user_id" bigint NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50),
	"target_id" bigint,
	"detail" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semester" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL,
	"is_current" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "semester_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(120),
	"password" varchar(255) NOT NULL,
	"class_id" bigint NOT NULL,
	"is_first_login" smallint DEFAULT 1 NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"login_fail_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "student_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "student_transfer" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" bigint NOT NULL,
	"from_class_id" bigint NOT NULL,
	"to_class_id" bigint NOT NULL,
	"reason" varchar(500),
	"operated_by" bigint NOT NULL,
	"transferred_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"experiment_id" bigint NOT NULL,
	"questionnaire_pdf_path" varchar(500),
	"report_pdf_path" varchar(500),
	"pdf_snapshot_questionnaire" jsonb,
	"pdf_snapshot_sampling_results" jsonb,
	"pdf_snapshot_sample_plan" jsonb,
	"pdf_snapshot_population_size" integer,
	"pdf_snapshot_report_content" text,
	"pdf_snapshot_topic_name" varchar(200),
	"pdf_snapshot_student_name" varchar(100),
	"pdf_status" smallint DEFAULT 0 NOT NULL,
	"pdf_generation_attempts" integer DEFAULT 0 NOT NULL,
	"pdf_last_attempt_at" timestamp,
	"pdf_generated_at" timestamp,
	"pdf_error" varchar(500),
	"score_questionnaire" numeric(5, 2),
	"score_process" numeric(5, 2),
	"score_report" numeric(5, 2),
	"total_score" numeric(5, 2),
	"teacher_comment" text,
	"reject_reason" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"graded_by_type" smallint,
	"graded_by_id" bigint,
	"locked_by_type" smallint,
	"locked_by_id" bigint,
	"locked_at" timestamp,
	"submitted_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"graded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"config_key" varchar(100) NOT NULL,
	"config_value" text NOT NULL,
	"value_type" varchar(20) DEFAULT 'string' NOT NULL,
	"description" varchar(500),
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "system_config_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "system_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"metric_value" numeric(10, 2) NOT NULL,
	"recorded_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"topic_id" bigint NOT NULL,
	"class_id" bigint NOT NULL,
	"open_time" timestamp,
	"deadline" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"is_first_login" smallint DEFAULT 1 NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"login_fail_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "teacher_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"teacher_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"excel_file_path" varchar(500),
	"excel_row_count" integer DEFAULT 0,
	"field_mapping" jsonb,
	"weight_config" jsonb,
	"recommend_questions" jsonb,
	"status" smallint DEFAULT 0 NOT NULL,
	"is_deleted" smallint DEFAULT 0 NOT NULL,
	"locked_by" bigint,
	"locked_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_attachment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"topic_id" bigint NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"file_type" varchar(50) NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_token" varchar(128) NOT NULL,
	"user_type" smallint NOT NULL,
	"user_id" bigint NOT NULL,
	"device_info" varchar(500),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_active_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "user_session_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE INDEX "idx_announcement_status" ON "announcement" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_announcement_user" ON "announcement_read" USING btree ("announcement_id","user_type","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_read_user" ON "announcement_read" USING btree ("user_type","user_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_status" ON "assistant" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assistant_creator_teacher_id" ON "assistant" USING btree ("creator_teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_assistant_class" ON "assistant_class" USING btree ("assistant_id","class_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_class_class_id" ON "assistant_class" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_class_semester_id" ON "class" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "idx_class_teacher_id" ON "class" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_student_task" ON "experiment" USING btree ("student_id","task_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_task_id" ON "experiment" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_status" ON "experiment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_login_log_user" ON "login_log" USING btree ("user_type","user_id");--> statement-breakpoint
CREATE INDEX "idx_login_log_login_at" ON "login_log" USING btree ("login_at");--> statement-breakpoint
CREATE INDEX "idx_notification_receiver" ON "notification" USING btree ("receiver_type","receiver_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_notification_type" ON "notification" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notification_created" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_operation_log_user" ON "operation_log" USING btree ("user_type","user_id");--> statement-breakpoint
CREATE INDEX "idx_operation_log_action" ON "operation_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_operation_log_created_at" ON "operation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_student_class_id" ON "student" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_student_status" ON "student" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_student_deleted" ON "student" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_student_transfer_student" ON "student_transfer" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_student_transfer_from_class" ON "student_transfer" USING btree ("from_class_id");--> statement-breakpoint
CREATE INDEX "idx_student_transfer_to_class" ON "student_transfer" USING btree ("to_class_id");--> statement-breakpoint
CREATE INDEX "idx_submission_experiment_id" ON "submission" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "idx_submission_experiment_submitted_id" ON "submission" USING btree ("experiment_id","submitted_at","id");--> statement-breakpoint
CREATE INDEX "idx_submission_status" ON "submission" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_submission_pdf_status_attempt" ON "submission" USING btree ("pdf_status","pdf_last_attempt_at","id");--> statement-breakpoint
CREATE INDEX "idx_submission_locked" ON "submission" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "idx_system_metrics_type_time" ON "system_metrics" USING btree ("metric_type","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_topic_class" ON "task" USING btree ("topic_id","class_id");--> statement-breakpoint
CREATE INDEX "idx_task_class_id" ON "task" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_task_deleted" ON "task" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_teacher_status" ON "teacher" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_topic_teacher_id" ON "topic" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_topic_status" ON "topic" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_topic_deleted" ON "topic" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_topic_attachment_topic_id" ON "topic_attachment" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_user_session_user" ON "user_session" USING btree ("user_type","user_id");--> statement-breakpoint
CREATE INDEX "idx_user_session_expires" ON "user_session" USING btree ("expires_at");