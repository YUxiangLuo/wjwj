ALTER TABLE "topic" ADD COLUMN "variable_dictionary_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Preserve already-confirmed dictionaries if the metadata foundation was applied separately.
UPDATE "topic"
SET "variable_dictionary_revision" = ("variable_dictionary"->>'revision')::bigint
WHERE "variable_dictionary" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_ck_variable_dictionary_revision" CHECK ("topic"."variable_dictionary_revision" between 0 and 9007199254740991);