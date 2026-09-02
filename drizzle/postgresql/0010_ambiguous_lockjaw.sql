ALTER TABLE "admin" DROP CONSTRAINT "admin_ck_first_login";--> statement-breakpoint
ALTER TABLE "admin" DROP CONSTRAINT "admin_ck_login_fail_count";--> statement-breakpoint
ALTER TABLE "student" DROP CONSTRAINT "student_ck_first_login";--> statement-breakpoint
ALTER TABLE "student" DROP CONSTRAINT "student_ck_login_fail_count";--> statement-breakpoint
ALTER TABLE "teacher" DROP CONSTRAINT "teacher_ck_first_login";--> statement-breakpoint
ALTER TABLE "teacher" DROP CONSTRAINT "teacher_ck_login_fail_count";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "is_first_login";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "login_fail_count";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "locked_until";--> statement-breakpoint
ALTER TABLE "student" DROP COLUMN "is_first_login";--> statement-breakpoint
ALTER TABLE "student" DROP COLUMN "login_fail_count";--> statement-breakpoint
ALTER TABLE "student" DROP COLUMN "locked_until";--> statement-breakpoint
ALTER TABLE "teacher" DROP COLUMN "is_first_login";--> statement-breakpoint
ALTER TABLE "teacher" DROP COLUMN "login_fail_count";--> statement-breakpoint
ALTER TABLE "teacher" DROP COLUMN "locked_until";