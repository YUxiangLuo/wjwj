ALTER TABLE "admin" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "announcement" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "announcement" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "announcement" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "announcement" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "announcement_read" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone USING "read_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "announcement_read" ALTER COLUMN "read_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assistant" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "assistant_class" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "assistant_class" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "class" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "stage1_completed_at" SET DATA TYPE timestamp with time zone USING "stage1_completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "stage2_completed_at" SET DATA TYPE timestamp with time zone USING "stage2_completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "stage3_completed_at" SET DATA TYPE timestamp with time zone USING "stage3_completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "stage4_completed_at" SET DATA TYPE timestamp with time zone USING "stage4_completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "last_saved_at" SET DATA TYPE timestamp with time zone USING "last_saved_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "experiment" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "login_log" ALTER COLUMN "login_at" SET DATA TYPE timestamp with time zone USING "login_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "login_log" ALTER COLUMN "login_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone USING "read_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "operation_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "operation_log" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "semester" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "semester" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "semester" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "semester" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "student_transfer" ALTER COLUMN "transferred_at" SET DATA TYPE timestamp with time zone USING "transferred_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "student_transfer" ALTER COLUMN "transferred_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "pdf_last_attempt_at" SET DATA TYPE timestamp with time zone USING "pdf_last_attempt_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "pdf_generated_at" SET DATA TYPE timestamp with time zone USING "pdf_generated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "locked_at" SET DATA TYPE timestamp with time zone USING "locked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "submitted_at" SET DATA TYPE timestamp with time zone USING "submitted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "submitted_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "submission" ALTER COLUMN "graded_at" SET DATA TYPE timestamp with time zone USING "graded_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_config" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_config" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "system_metrics" ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone USING "recorded_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "system_metrics" ALTER COLUMN "recorded_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "open_time" SET DATA TYPE timestamp with time zone USING "open_time" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "deadline" SET DATA TYPE timestamp with time zone USING "deadline" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "locked_at" SET DATA TYPE timestamp with time zone USING "locked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "topic_attachment" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "topic_attachment" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp with time zone USING "last_active_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_session" ALTER COLUMN "last_active_at" SET DEFAULT CURRENT_TIMESTAMP;