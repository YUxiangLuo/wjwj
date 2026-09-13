CREATE TABLE "research_analysis_run" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"experiment_id" bigint NOT NULL,
	"request_key" varchar(34) NOT NULL,
	"input_version" integer NOT NULL,
	"spec_hash" varchar(64) NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_analysis_run_ck_identity" CHECK ("research_analysis_run"."id" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' and "research_analysis_run"."request_key" ~ '^r_[a-f0-9]{32}$' and "research_analysis_run"."spec_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "research_analysis_run_ck_version" CHECK ("research_analysis_run"."input_version" >= 1),
	CONSTRAINT "research_analysis_run_ck_document" CHECK ((jsonb_typeof("research_analysis_run"."document") = 'object' and "research_analysis_run"."document" ?& array['id','schemaVersion','algorithmVersion','createdAt','spec','variable','source','result'] and "research_analysis_run"."document"->>'id' = "research_analysis_run"."id" and "research_analysis_run"."document"->'schemaVersion' = '1'::jsonb and "research_analysis_run"."document"->>'algorithmVersion' = 'descriptive-v1' and octet_length("research_analysis_run"."document"::text) <= 65536) is true)
);
--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "analysis_references" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "sampling_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Explicit initial anchor for already-completed sampling. No old analysis runs
-- exist, and no original version, timestamp, report, snapshot or grade is changed.
UPDATE "experiment" SET "sampling_revision" = "version" WHERE "stage3_completed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "research_analysis_run" ADD CONSTRAINT "research_analysis_run_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_analysis_run_uk_request" ON "research_analysis_run" USING btree ("experiment_id","request_key");--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_sampling_revision" CHECK ("experiment"."sampling_revision" >= 0 and "experiment"."sampling_revision" <= "experiment"."version");--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_ck_analysis_references" CHECK (jsonb_typeof("experiment"."analysis_references") = 'array' and jsonb_array_length("experiment"."analysis_references") <= 10);