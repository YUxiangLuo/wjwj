-- Drizzle's stock jsonb encoder stringified values before Bun SQL bound them,
-- so historical rows contain a JSON string at the top level. Unwrap that
-- string first; the migration runner applies this file in one transaction.
UPDATE "topic"
SET "field_mapping" = ("field_mapping" #>> '{}')::jsonb
WHERE jsonb_typeof("field_mapping") = 'string';--> statement-breakpoint
UPDATE "topic"
SET "weight_config" = ("weight_config" #>> '{}')::jsonb
WHERE jsonb_typeof("weight_config") = 'string';--> statement-breakpoint
UPDATE "topic"
SET "recommend_questions" = ("recommend_questions" #>> '{}')::jsonb
WHERE jsonb_typeof("recommend_questions") = 'string';--> statement-breakpoint
UPDATE "experiment"
SET "questionnaire" = ("questionnaire" #>> '{}')::jsonb
WHERE jsonb_typeof("questionnaire") = 'string';--> statement-breakpoint
UPDATE "experiment"
SET "sample_plan" = ("sample_plan" #>> '{}')::jsonb
WHERE jsonb_typeof("sample_plan") = 'string';--> statement-breakpoint
UPDATE "experiment"
SET "sampling_results" = ("sampling_results" #>> '{}')::jsonb
WHERE jsonb_typeof("sampling_results") = 'string';--> statement-breakpoint
UPDATE "experiment"
SET "submission_snapshot" = ("submission_snapshot" #>> '{}')::jsonb
WHERE jsonb_typeof("submission_snapshot") = 'string';--> statement-breakpoint

ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_questionnaire_object" CHECK ("experiment"."questionnaire" is null or jsonb_typeof("experiment"."questionnaire") = 'object');--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_sample_plan_object" CHECK ("experiment"."sample_plan" is null or jsonb_typeof("experiment"."sample_plan") = 'object');--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_sampling_results_object" CHECK ("experiment"."sampling_results" is null or jsonb_typeof("experiment"."sampling_results") = 'object');--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_submission_snapshot_object" CHECK ("experiment"."submission_snapshot" is null or jsonb_typeof("experiment"."submission_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_field_mapping_object" CHECK ("topic"."field_mapping" is null or jsonb_typeof("topic"."field_mapping") = 'object');--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_weight_config_object" CHECK ("topic"."weight_config" is null or jsonb_typeof("topic"."weight_config") = 'object');--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_recommend_questions_array" CHECK ("topic"."recommend_questions" is null or jsonb_typeof("topic"."recommend_questions") = 'array');
