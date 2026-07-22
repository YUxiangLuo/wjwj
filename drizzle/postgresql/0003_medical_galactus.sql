ALTER TABLE "admin" ADD COLUMN "is_first_login" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "login_fail_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "login_fail_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "login_fail_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "locked_until" timestamp with time zone;