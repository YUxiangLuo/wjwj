import { readdir, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/db";
import { topic, topicAttachment } from "../src/db/schema";
import { resolveStoragePath } from "../src/server/storage-files";

const storageRoot = resolve(process.cwd(), "storage");
const args = new Set(process.argv.slice(2));
const shouldDelete = args.has("--delete");

async function listFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw error;
    });
    const nested = await Promise.all(entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? listFiles(path) : [path];
    }));
    return nested.flat();
}

function addReference(references: Set<string>, path: unknown) {
    if (typeof path !== "string" || !path.trim()) return;
    try {
        references.add(resolveStoragePath(path));
    } catch {
        console.warn(`忽略数据库中的非法存储路径：${path}`);
    }
}

async function loadReferences() {
    const references = new Set<string>();
    const [state] = await db.execute(sql`
        SELECT
            to_regclass('public.topic')::text AS topic_table,
            to_regclass('public.topic_attachment')::text AS attachment_table,
            to_regclass('public.submission')::text AS submission_table,
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'experiment'
                  AND column_name = 'sampling_data_path'
            ) AS legacy_sampling_column
    `) as unknown as Array<{
        topic_table: string | null;
        attachment_table: string | null;
        submission_table: string | null;
        legacy_sampling_column: boolean;
    }>;

    if (state?.topic_table) {
        const topics = await db.select({ path: topic.excelFilePath }).from(topic);
        for (const row of topics) addReference(references, row.path);
    }
    if (state?.attachment_table) {
        const attachments = await db.select({ path: topicAttachment.filePath }).from(topicAttachment);
        for (const row of attachments) addReference(references, row.path);
    }
    if (state?.submission_table) {
        const rows = await db.execute(sql.raw(`
            SELECT questionnaire_pdf_path AS path FROM public.submission WHERE questionnaire_pdf_path IS NOT NULL
            UNION ALL
            SELECT report_pdf_path AS path FROM public.submission WHERE report_pdf_path IS NOT NULL
        `)) as unknown as Array<{ path: string | null }>;
        for (const row of rows) addReference(references, row.path);
    }
    if (state?.legacy_sampling_column) {
        const rows = await db.execute(sql.raw(`
            SELECT sampling_data_path AS path FROM public.experiment WHERE sampling_data_path IS NOT NULL
        `)) as unknown as Array<{ path: string | null }>;
        for (const row of rows) addReference(references, row.path);
    }
    return references;
}

try {
    if (shouldDelete && !args.has("--force")) {
        throw new Error("删除孤儿文件必须同时提供 --delete 和 --force");
    }

    const [files, references] = await Promise.all([listFiles(storageRoot), loadReferences()]);
    const orphans = files.filter((path) => !path.endsWith(`${sep}.gitkeep`) && !references.has(path));
    const totalBytes = orphans.reduce((sum, path) => sum + Bun.file(path).size, 0);

    console.log(`数据库引用文件：${references.size}`);
    console.log(`存储文件总数：${files.length}`);
    console.log(`未引用文件：${orphans.length}（${(totalBytes / 1024 / 1024).toFixed(2)} MiB）`);
    for (const path of orphans) console.log(`  ${relative(process.cwd(), path)}`);

    if (shouldDelete) {
        for (const path of orphans) await unlink(path);
        console.log(`已删除 ${orphans.length} 个未引用文件。`);
    } else if (orphans.length > 0) {
        console.log("当前仅审计，未删除文件。确认列表后可运行 bun run storage:clean。");
    }
} catch (error) {
    console.error("存储审计失败：", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
