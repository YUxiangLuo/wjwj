-- Removes the account status (停用/启用) flag from student and teacher.
-- Previously disabled accounts keep their rows and become normal active accounts;
-- no account data or history is deleted by this migration.

ALTER TABLE "student" DROP CONSTRAINT "student_ck_status_value";--> statement-breakpoint
ALTER TABLE "teacher" DROP CONSTRAINT "teacher_ck_status_value";--> statement-breakpoint
DROP INDEX "student_idx_status";--> statement-breakpoint
DROP INDEX "teacher_idx_status";--> statement-breakpoint
ALTER TABLE "student" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "teacher" DROP COLUMN "status";