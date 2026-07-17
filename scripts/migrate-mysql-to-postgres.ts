import { SQL } from "bun";

export type TableSpec = {
    name: string;
    columns: readonly string[];
    dateColumns?: readonly string[];
    jsonColumns?: readonly string[];
};

const tables: readonly TableSpec[] = [
    {
        name: "admin",
        columns: ["id", "username", "password", "is_first_login", "login_fail_count", "locked_until", "created_at", "updated_at"],
        dateColumns: ["locked_until", "created_at", "updated_at"],
    },
    {
        name: "teacher",
        columns: ["id", "employee_id", "name", "password", "is_first_login", "status", "login_fail_count", "locked_until", "created_at", "updated_at"],
        dateColumns: ["locked_until", "created_at", "updated_at"],
    },
    {
        name: "assistant",
        columns: ["id", "account", "name", "password", "creator_teacher_id", "is_first_login", "status", "login_fail_count", "locked_until", "created_at", "updated_at"],
        dateColumns: ["locked_until", "created_at", "updated_at"],
    },
    {
        name: "semester",
        columns: ["id", "name", "is_current", "created_at", "updated_at"],
        dateColumns: ["created_at", "updated_at"],
    },
    {
        name: "class",
        columns: ["id", "name", "semester_id", "teacher_id", "created_at", "updated_at"],
        dateColumns: ["created_at", "updated_at"],
    },
    {
        name: "student",
        columns: ["id", "student_id", "name", "email", "password", "class_id", "is_first_login", "status", "login_fail_count", "locked_until", "deleted_at", "created_at", "updated_at"],
        dateColumns: ["locked_until", "deleted_at", "created_at", "updated_at"],
    },
    {
        name: "assistant_class",
        columns: ["id", "assistant_id", "class_id", "created_at"],
        dateColumns: ["created_at"],
    },
    {
        name: "student_transfer",
        columns: ["id", "student_id", "from_class_id", "to_class_id", "reason", "operated_by", "transferred_at"],
        dateColumns: ["transferred_at"],
    },
    {
        name: "topic",
        columns: ["id", "teacher_id", "name", "description", "excel_file_path", "excel_row_count", "field_mapping", "weight_config", "recommend_questions", "status", "is_deleted", "locked_by", "locked_at", "deleted_at", "created_at", "updated_at"],
        dateColumns: ["locked_at", "deleted_at", "created_at", "updated_at"],
        jsonColumns: ["field_mapping", "weight_config", "recommend_questions"],
    },
    {
        name: "topic_attachment",
        columns: ["id", "topic_id", "file_name", "file_path", "file_type", "file_size", "created_at"],
        dateColumns: ["created_at"],
    },
    {
        name: "task",
        columns: ["id", "topic_id", "class_id", "open_time", "deadline", "deleted_at", "created_at", "updated_at"],
        dateColumns: ["open_time", "deadline", "deleted_at", "created_at", "updated_at"],
    },
    {
        name: "experiment",
        columns: ["id", "student_id", "task_id", "current_stage", "status", "questionnaire", "sample_plan", "sampling_results", "sampling_data_path", "report_content", "stage1_completed_at", "stage2_completed_at", "stage3_completed_at", "stage4_completed_at", "last_saved_at", "version", "created_at", "updated_at"],
        dateColumns: ["stage1_completed_at", "stage2_completed_at", "stage3_completed_at", "stage4_completed_at", "last_saved_at", "created_at", "updated_at"],
        jsonColumns: ["questionnaire", "sample_plan", "sampling_results"],
    },
    {
        name: "submission",
        columns: ["id", "experiment_id", "questionnaire_pdf_path", "report_pdf_path", "pdf_snapshot_questionnaire", "pdf_snapshot_sampling_results", "pdf_snapshot_sample_plan", "pdf_snapshot_population_size", "pdf_snapshot_report_content", "pdf_snapshot_topic_name", "pdf_snapshot_student_name", "pdf_status", "pdf_generation_attempts", "pdf_last_attempt_at", "pdf_generated_at", "pdf_error", "score_questionnaire", "score_process", "score_report", "total_score", "teacher_comment", "reject_reason", "status", "graded_by_type", "graded_by_id", "locked_by_type", "locked_by_id", "locked_at", "submitted_at", "graded_at"],
        dateColumns: ["pdf_last_attempt_at", "pdf_generated_at", "locked_at", "submitted_at", "graded_at"],
        jsonColumns: ["pdf_snapshot_questionnaire", "pdf_snapshot_sampling_results", "pdf_snapshot_sample_plan"],
    },
    {
        name: "announcement",
        columns: ["id", "title", "content", "target_scope", "status", "created_at", "updated_at"],
        dateColumns: ["created_at", "updated_at"],
    },
    {
        name: "announcement_read",
        columns: ["id", "announcement_id", "user_type", "user_id", "read_at"],
        dateColumns: ["read_at"],
    },
    {
        name: "login_log",
        columns: ["id", "user_type", "user_id", "login_at", "ip_address", "user_agent"],
        dateColumns: ["login_at"],
    },
    {
        name: "system_metrics",
        columns: ["id", "metric_type", "metric_value", "recorded_at"],
        dateColumns: ["recorded_at"],
    },
    {
        name: "operation_log",
        columns: ["id", "user_type", "user_id", "action", "target_type", "target_id", "detail", "ip_address", "created_at"],
        dateColumns: ["created_at"],
        jsonColumns: ["detail"],
    },
    {
        name: "user_session",
        columns: ["id", "session_token", "user_type", "user_id", "device_info", "created_at", "expires_at", "last_active_at"],
        dateColumns: ["created_at", "expires_at", "last_active_at"],
    },
    {
        name: "notification",
        columns: ["id", "receiver_type", "receiver_id", "type", "title", "content", "related_type", "related_id", "is_read", "read_at", "created_at"],
        dateColumns: ["read_at", "created_at"],
    },
    {
        name: "system_config",
        columns: ["id", "config_key", "config_value", "value_type", "description", "updated_at"],
        dateColumns: ["updated_at"],
    },
] as const;

const coreOrphanChecks = [
    ["assistant.teacher", `SELECT COUNT(*)::integer AS count FROM "assistant" a LEFT JOIN "teacher" t ON t.id = a.creator_teacher_id WHERE t.id IS NULL`],
    ["student.class", `SELECT COUNT(*)::integer AS count FROM "student" s LEFT JOIN "class" c ON c.id = s.class_id WHERE c.id IS NULL`],
    ["class.semester", `SELECT COUNT(*)::integer AS count FROM "class" c LEFT JOIN "semester" s ON s.id = c.semester_id WHERE s.id IS NULL`],
    ["class.teacher", `SELECT COUNT(*)::integer AS count FROM "class" c LEFT JOIN "teacher" t ON t.id = c.teacher_id WHERE t.id IS NULL`],
    ["assistant_class.assistant", `SELECT COUNT(*)::integer AS count FROM "assistant_class" ac LEFT JOIN "assistant" a ON a.id = ac.assistant_id WHERE a.id IS NULL`],
    ["assistant_class.class", `SELECT COUNT(*)::integer AS count FROM "assistant_class" ac LEFT JOIN "class" c ON c.id = ac.class_id WHERE c.id IS NULL`],
    ["topic.teacher", `SELECT COUNT(*)::integer AS count FROM "topic" tp LEFT JOIN "teacher" t ON t.id = tp.teacher_id WHERE t.id IS NULL`],
    ["topic_attachment.topic", `SELECT COUNT(*)::integer AS count FROM "topic_attachment" ta LEFT JOIN "topic" tp ON tp.id = ta.topic_id WHERE tp.id IS NULL`],
    ["task.topic", `SELECT COUNT(*)::integer AS count FROM "task" x LEFT JOIN "topic" tp ON tp.id = x.topic_id WHERE tp.id IS NULL`],
    ["task.class", `SELECT COUNT(*)::integer AS count FROM "task" x LEFT JOIN "class" c ON c.id = x.class_id WHERE c.id IS NULL`],
    ["experiment.student", `SELECT COUNT(*)::integer AS count FROM "experiment" e LEFT JOIN "student" s ON s.id = e.student_id WHERE s.id IS NULL`],
    ["experiment.task", `SELECT COUNT(*)::integer AS count FROM "experiment" e LEFT JOIN "task" t ON t.id = e.task_id WHERE t.id IS NULL`],
    ["submission.experiment", `SELECT COUNT(*)::integer AS count FROM "submission" s LEFT JOIN "experiment" e ON e.id = s.experiment_id WHERE e.id IS NULL`],
    ["announcement_read.announcement", `SELECT COUNT(*)::integer AS count FROM "announcement_read" ar LEFT JOIN "announcement" a ON a.id = ar.announcement_id WHERE a.id IS NULL`],
] as const;

function requireEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function quoteMysqlIdentifier(value: string) {
    return `\`${value.replaceAll("`", "``")}\``;
}

function quotePostgresIdentifier(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

function parseMysqlDateTime(value: unknown, timezoneOffset: string, label: string) {
    if (value == null) return null;
    if (typeof value !== "string") throw new Error(`${label}: expected a datetime string`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
        throw new Error(`${label}: invalid MySQL datetime ${JSON.stringify(value)}`);
    }
    const millisecondPrecision = value.replace(/\.(\d{3})\d+$/, ".$1");
    const parsed = new Date(`${millisecondPrecision}${timezoneOffset}`);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${label}: datetime is out of range`);
    return parsed;
}

function validateRawJson(value: unknown, label: string) {
    if (value == null) return null;
    if (typeof value !== "string") throw new Error(`${label}: expected raw JSON text`);
    try {
        JSON.parse(value);
        return value;
    } catch (error) {
        throw new Error(`${label}: invalid JSON`, { cause: error });
    }
}

function normalizeBigInt(value: unknown, label: string) {
    if (typeof value !== "bigint") return value;
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) {
        throw new Error(`${label}: bigint exceeds JavaScript safe integer range`);
    }
    return numberValue;
}

function sourceSelect(spec: TableSpec) {
    const dates = new Set(spec.dateColumns ?? []);
    const expressions = spec.columns.map((column) => {
        const identifier = quoteMysqlIdentifier(column);
        return dates.has(column)
            ? `DATE_FORMAT(${identifier}, '%Y-%m-%dT%H:%i:%s.%f') AS ${identifier}`
            : identifier;
    });
    return `SELECT ${expressions.join(", ")} FROM ${quoteMysqlIdentifier(spec.name)} ORDER BY ${quoteMysqlIdentifier("id")}`;
}

export function transformSourceRows(spec: TableSpec, rows: Array<Record<string, unknown>>, timezoneOffset: string) {
    const dates = new Set(spec.dateColumns ?? []);
    const json = new Set(spec.jsonColumns ?? []);
    return rows
        .filter((row) => spec.name !== "system_config" || !String(row.config_key ?? "").startsWith("scheduler."))
        .map((row, rowIndex) => Object.fromEntries(spec.columns.map((column) => {
            const label = `${spec.name}[${rowIndex}].${column}`;
            let value = normalizeBigInt(row[column], label);
            if (dates.has(column)) value = parseMysqlDateTime(value, timezoneOffset, label);
            if (json.has(column)) value = validateRawJson(value, label);
            return [column, value];
        })));
}

function canonicalJson(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, canonicalJson(nested)])
        );
    }
    return value;
}

function normalizeTargetAgainstSource(sourceValue: unknown, targetValue: unknown): unknown {
    if (sourceValue instanceof Date) {
        if (!(targetValue instanceof Date)) return targetValue;
        return targetValue.toISOString();
    }
    if (typeof sourceValue === "number") return Number(targetValue);
    if (sourceValue && typeof sourceValue === "object") return canonicalJson(targetValue);
    return targetValue;
}

function assertRowsMatch(spec: TableSpec, sourceRows: Array<Record<string, unknown>>, targetRows: Array<Record<string, unknown>>) {
    if (sourceRows.length !== targetRows.length) {
        throw new Error(`${spec.name}: row count mismatch (${sourceRows.length} source, ${targetRows.length} target)`);
    }

    const jsonColumns = new Set(spec.jsonColumns ?? []);
    const comparableColumns = spec.columns.filter((column) => !jsonColumns.has(column));
    const normalizedSource = sourceRows.map((row) => canonicalJson(Object.fromEntries(
        comparableColumns.map((column) => [column, row[column]])
    )));
    const normalizedTarget = targetRows.map((row, index) => canonicalJson(Object.fromEntries(
        comparableColumns.map((column) => [
            column,
            normalizeTargetAgainstSource(sourceRows[index]?.[column], row[column]),
        ])
    )));

    const sourceText = JSON.stringify(normalizedSource);
    const targetText = JSON.stringify(normalizedTarget);
    if (sourceText !== targetText) {
        const mismatch = normalizedSource.findIndex((row, index) => (
            JSON.stringify(row) !== JSON.stringify(normalizedTarget[index])
        ));
        throw new Error(`${spec.name}: data mismatch at row ${mismatch}`);
    }

    const hash = new Bun.CryptoHasher("sha256").update(sourceText).digest("hex");
    return hash;
}

export async function insertBatch(target: SQL, spec: TableSpec, rows: Array<Record<string, unknown>>) {
    if (rows.length === 0) return;

    const jsonColumns = new Set(spec.jsonColumns ?? []);
    const values: unknown[] = [];
    const valueRows = rows.map((row) => {
        const placeholders = spec.columns.map((column) => {
            values.push(row[column]);
            const placeholder = `$${values.length}`;
            return jsonColumns.has(column) ? `${placeholder}::text::jsonb` : placeholder;
        });
        return `(${placeholders.join(", ")})`;
    });
    const columns = spec.columns.map(quotePostgresIdentifier).join(", ");
    const query = `INSERT INTO ${quotePostgresIdentifier(spec.name)} (${columns}) VALUES ${valueRows.join(", ")}`;
    await target.unsafe(query, values);
}

export async function assertJsonRowsMatch(
    target: SQL,
    spec: TableSpec,
    sourceRows: Array<Record<string, unknown>>
) {
    const jsonColumns = [...(spec.jsonColumns ?? [])];
    if (jsonColumns.length === 0) return "";

    for (let offset = 0; offset < sourceRows.length; offset += 250) {
        const batch = sourceRows.slice(offset, offset + 250);
        const values: unknown[] = [];
        const valueRows = batch.map((row) => {
            values.push(row.id);
            const fields = [`$${values.length}::bigint`];
            for (const column of jsonColumns) {
                values.push(row[column]);
                fields.push(`$${values.length}::text::jsonb`);
            }
            return `(${fields.join(", ")})`;
        });
        const sourceColumns = ["id", ...jsonColumns].map(quotePostgresIdentifier).join(", ");
        const differences = jsonColumns
            .map((column) => `target.${quotePostgresIdentifier(column)} IS DISTINCT FROM source.${quotePostgresIdentifier(column)}`)
            .join(" OR ");
        const query = `
            WITH source (${sourceColumns}) AS (VALUES ${valueRows.join(", ")})
            SELECT COUNT(*)::integer AS count
            FROM source
            INNER JOIN ${quotePostgresIdentifier(spec.name)} AS target ON target."id" = source."id"
            WHERE ${differences}
        `;
        const [result] = await target.unsafe(query, values) as Array<{ count: number }>;
        if ((result?.count ?? 0) !== 0) {
            throw new Error(`${spec.name}: JSON mismatch in ${result!.count} rows`);
        }
    }

    const selectColumns = [
        quotePostgresIdentifier("id"),
        ...jsonColumns.map((column) => (
            `${quotePostgresIdentifier(column)}::text AS ${quotePostgresIdentifier(column)}`
        )),
    ].join(", ");
    const canonicalRows = await target.unsafe(
        `SELECT ${selectColumns} FROM ${quotePostgresIdentifier(spec.name)} ORDER BY "id"`
    ) as Array<Record<string, unknown>>;
    return new Bun.CryptoHasher("sha256").update(JSON.stringify(canonicalRows)).digest("hex");
}

async function assertTargetIsEmpty(target: SQL) {
    for (const spec of tables) {
        const [row] = await target.unsafe(
            `SELECT COUNT(*)::integer AS count FROM ${quotePostgresIdentifier(spec.name)}`
        ) as Array<{ count: number }>;
        if ((row?.count ?? 0) !== 0) {
            throw new Error(`Target table ${spec.name} is not empty`);
        }
    }
}

async function main() {
    const sourceUrl = requireEnv("MYSQL_SOURCE_URL");
    const targetUrl = requireEnv("DATABASE_URL");
    const timezoneOffset = process.env.MYSQL_TIMEZONE_OFFSET?.trim() || "+09:00";
    if (!/^[+-]\d{2}:\d{2}$/.test(timezoneOffset)) {
        throw new Error("MYSQL_TIMEZONE_OFFSET must look like +09:00");
    }
    if (!/^mysql:\/\//i.test(sourceUrl)) throw new Error("MYSQL_SOURCE_URL must use the mysql:// protocol");
    if (!/^postgres(?:ql)?:\/\//i.test(targetUrl)) throw new Error("DATABASE_URL must use postgres:// or postgresql://");

    const source = new SQL(sourceUrl);
    const target = new SQL(targetUrl);
    const sourceRowsByTable = new Map<string, Array<Record<string, unknown>>>();

    try {
        await source`SET time_zone = ${timezoneOffset}`;
        await target`SET TIME ZONE 'Asia/Tokyo'`;
        await assertTargetIsEmpty(target);

        for (const spec of tables) {
            const rawRows = await source.unsafe(sourceSelect(spec)) as Array<Record<string, unknown>>;
            const rows = transformSourceRows(spec, rawRows, timezoneOffset);
            sourceRowsByTable.set(spec.name, rows);
            console.log(`Read ${spec.name}: ${rows.length} rows`);
        }

        await target.begin(async (tx) => {
            await tx`SET LOCAL TIME ZONE 'Asia/Tokyo'`;
            for (const spec of tables) {
                const rows = sourceRowsByTable.get(spec.name) ?? [];
                for (let offset = 0; offset < rows.length; offset += 250) {
                    const batch = rows.slice(offset, offset + 250);
                    await insertBatch(tx, spec, batch);
                }
            }

            for (const spec of tables) {
                const jsonColumns = new Set(spec.jsonColumns ?? []);
                const selectColumns = spec.columns
                    .filter((column) => !jsonColumns.has(column))
                    .map(quotePostgresIdentifier)
                    .join(", ");
                const targetRows = await tx.unsafe(
                    `SELECT ${selectColumns} FROM ${quotePostgresIdentifier(spec.name)} ORDER BY "id"`
                ) as Array<Record<string, unknown>>;
                const sourceRows = sourceRowsByTable.get(spec.name) ?? [];
                const scalarHash = assertRowsMatch(spec, sourceRows, targetRows);
                const jsonHash = await assertJsonRowsMatch(tx, spec, sourceRows);
                const hash = new Bun.CryptoHasher("sha256").update(scalarHash).update(jsonHash).digest("hex");
                console.log(`Verified ${spec.name}: ${targetRows.length} rows, sha256=${hash.slice(0, 16)}`);
            }

            for (const [name, query] of coreOrphanChecks) {
                const [row] = await tx.unsafe(query) as Array<{ count: number }>;
                if ((row?.count ?? 0) !== 0) throw new Error(`${name}: ${row!.count} orphan rows`);
            }

            for (const spec of tables) {
                await tx`
                    SELECT setval(
                        pg_get_serial_sequence(${`"${spec.name}"`}, 'id'),
                        COALESCE(MAX(id), 1),
                        COUNT(*) > 0
                    )
                    FROM ${tx(spec.name)}
                `;
            }
        });

        console.log("MySQL → PostgreSQL migration completed and verified.");
    } finally {
        await Promise.allSettled([source.close(), target.close()]);
    }
}

if (import.meta.main) {
    try {
        await main();
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    }
}
