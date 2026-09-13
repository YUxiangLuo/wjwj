-- Representation-only migration. Run with application writers stopped and paired DB/storage backup.
-- Temporary functions exist only for this migration connection, never as runtime format adapters.
-- Ambiguous/malformed encodings abort the transaction; labels, existing IDs, bindings, reports and grades are not repaired.
CREATE FUNCTION pg_temp.wj_question_options(q jsonb, scope text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    opts jsonb;
    item jsonb;
    output jsonb := '[]'::jsonb;
    original_ids jsonb;
    used_ids text[] := ARRAY[]::text[];
    option_id text;
    label jsonb;
    position integer := 0;
    text_options boolean;
BEGIN
    IF jsonb_typeof(q) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: invalid question at %', scope;
    END IF;
    IF q->>'type' IS NULL OR q->>'type' NOT IN ('boolean', 'single', 'multiple', 'scale', 'numeric') THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: unsupported question type at %', scope;
    END IF;
    IF q->>'type' NOT IN ('single', 'multiple') THEN
        IF q ? 'options' OR q ? 'optionIds' THEN
            RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: options on non-choice question at %', scope;
        END IF;
        RETURN q;
    END IF;
    opts := q->'options';
    IF jsonb_typeof(opts) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: expected option array at %', scope;
    END IF;
    text_options := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(opts) entry WHERE jsonb_typeof(entry) <> 'string');
    IF q ? 'optionIds' THEN
        original_ids := q->'optionIds';
        IF NOT text_options OR jsonb_typeof(original_ids) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: ambiguous option identities at %', scope;
        END IF;
        IF jsonb_array_length(original_ids) <> jsonb_array_length(opts) THEN
            RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: identity count mismatch at %', scope;
        END IF;
    ELSIF text_options AND q ? 'variableBinding' THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: bound question lacks option identities at %', scope;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(opts) LOOP
        IF text_options THEN
            label := item;
            IF original_ids IS NULL THEN
                -- Explicit one-time identity allocation for formerly unbound options; deterministic across rollback/retry.
                option_id := 'o_m_' || md5(scope || '/option/' || position::text);
            ELSE
                IF jsonb_typeof(original_ids->position) IS DISTINCT FROM 'string' THEN
                    RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: non-text identity at %', scope;
                END IF;
                option_id := original_ids->>position;
            END IF;
        ELSE
            IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: mixed or non-text options at %', scope;
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 2
                OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
                OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: malformed option object at %', scope;
            END IF;
            option_id := item->>'id';
            label := item->'label';
        END IF;
        -- Match ECMAScript trim / UTF-16 length without normalizing stored identities.
        IF regexp_replace(option_id, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g') = ''
            OR length(option_id) + (SELECT count(*) FROM regexp_split_to_table(option_id, '') c WHERE ascii(c) > 65535) > 200
            OR option_id COLLATE "C" = ANY(used_ids) THEN
            RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: invalid or duplicate identity at %', scope;
        END IF;
        used_ids := array_append(used_ids, option_id);
        output := output || jsonb_build_array(jsonb_build_object('id', option_id, 'label', label));
        position := position + 1;
    END LOOP;
    RETURN jsonb_set(q - 'optionIds', '{options}', output);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.wj_question_list(items jsonb, scope text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    output jsonb := '[]'::jsonb;
    item jsonb;
    position integer := 0;
BEGIN
    IF items IS NULL THEN RETURN items; END IF;
    IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: expected native question array at %', scope;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
        output := output || jsonb_build_array(pg_temp.wj_question_options(item, scope || '/question/' || position::text));
        position := position + 1;
    END LOOP;
    RETURN output;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.wj_questionnaire_options(doc jsonb, scope text) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
    IF doc IS NULL OR doc = 'null'::jsonb THEN RETURN doc; END IF;
    IF jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'QUESTION_OPTIONS_MIGRATION: expected native questionnaire at %', scope;
    END IF;
    IF NOT (doc ? 'questions') THEN RETURN doc; END IF;
    RETURN jsonb_set(doc, '{questions}', pg_temp.wj_question_list(doc->'questions', scope));
END;
$$;
--> statement-breakpoint
LOCK TABLE topic, experiment IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE topic SET recommend_questions = pg_temp.wj_question_list(recommend_questions, 'topic/' || id::text)
WHERE recommend_questions IS NOT NULL;
--> statement-breakpoint
UPDATE experiment SET questionnaire = pg_temp.wj_questionnaire_options(questionnaire, 'experiment/' || id::text)
WHERE questionnaire IS NOT NULL;
--> statement-breakpoint
UPDATE experiment SET submission_snapshot = jsonb_set(submission_snapshot, '{questionnaire}',
    pg_temp.wj_questionnaire_options(submission_snapshot->'questionnaire', 'experiment/' || id::text))
WHERE submission_snapshot ? 'questionnaire';
