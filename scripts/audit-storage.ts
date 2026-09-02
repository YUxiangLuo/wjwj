import { readdir, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { eq, isNull, sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/db";
import { topic, topicAttachment } from "../src/db/schema";
import { acquireStorageMutationLock } from "../src/db/storage-mutation-lock";
import { resolveStoragePath } from "../src/server/storage-files";

const storageRoot = resolve(process.cwd(), "storage");
const args = new Set(process.argv.slice(2));
const shouldDelete = args.has("--delete");

export function storageDeletionToken(entries: Array<{ path: string; size: number }>) {
    const canonical = entries
        .map((entry) => `${entry.path}\t${entry.size}`)
        .sort()
        .join("\n");
    return new Bun.CryptoHasher("sha256").update(canonical).digest("hex").slice(0, 16);
}

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

type StorageReferenceReader = Pick<typeof db, "execute" | "select">;

export interface StorageSchemaState {
    topic_table: string | null;
    attachment_table: string | null;
    submission_table: string | null;
    legacy_sampling_column: boolean;
}

export async function loadReferences(
    client: StorageReferenceReader,
    knownState?: StorageSchemaState,
) {
    const references = new Set<string>();
    let state = knownState;
    if (!state) {
        [state] = await client.execute(sql`
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
        `) as unknown as StorageSchemaState[];
    }

    if (state?.topic_table) {
        const topics = await client
            .select({ path: topic.excelFilePath })
            .from(topic)
            .where(isNull(topic.deletedAt));
        for (const row of topics) addReference(references, row.path);
    }
    if (state?.attachment_table && state.topic_table) {
        const attachments = await client
            .select({ path: topicAttachment.filePath })
            .from(topicAttachment)
            .innerJoin(topic, eq(topicAttachment.topicId, topic.id))
            .where(isNull(topic.deletedAt));
        for (const row of attachments) addReference(references, row.path);
    }
    if (state?.submission_table) {
        const rows = await client.execute(sql.raw(`
            SELECT questionnaire_pdf_path AS path FROM public.submission WHERE questionnaire_pdf_path IS NOT NULL
            UNION ALL
            SELECT report_pdf_path AS path FROM public.submission WHERE report_pdf_path IS NOT NULL
        `)) as unknown as Array<{ path: string | null }>;
        for (const row of rows) addReference(references, row.path);
    }
    if (state?.legacy_sampling_column) {
        const rows = await client.execute(sql.raw(`
            SELECT sampling_data_path AS path FROM public.experiment WHERE sampling_data_path IS NOT NULL
        `)) as unknown as Array<{ path: string | null }>;
        for (const row of rows) addReference(references, row.path);
    }
    return references;
}

export async function runStorageAudit() {
    try {
        await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [files, references] = await Promise.all([listFiles(storageRoot), loadReferences(tx)]);
            const orphans = files.filter((path) => !path.endsWith(`${sep}.gitkeep`) && !references.has(path));
            const totalBytes = orphans.reduce((sum, path) => sum + Bun.file(path).size, 0);

            console.log(`数据库引用文件：${references.size}`);
            console.log(`存储文件总数：${files.length}`);
            console.log(`未引用文件：${orphans.length}（${(totalBytes / 1024 / 1024).toFixed(2)} MiB）`);
            for (const path of orphans) console.log(`  ${relative(process.cwd(), path)}`);

            const token = storageDeletionToken(orphans.map((path) => ({
                path: relative(process.cwd(), path),
                size: Bun.file(path).size,
            })));

            if (shouldDelete) {
                const confirmation = [...args]
                    .find((arg) => arg.startsWith("--confirm="))
                    ?.slice("--confirm=".length);
                if (!confirmation || confirmation !== token) {
                    throw new Error(`删除确认不匹配；请先运行 storage:audit，再执行 bun run storage:clean -- --confirm=${token}`);
                }
                for (const path of orphans) await unlink(path);
                console.log(`已删除 ${orphans.length} 个未引用文件。`);
            } else if (orphans.length > 0) {
                console.log(`当前仅审计，未删除文件。确认列表后运行 bun run storage:clean -- --confirm=${token}`);
            }
        });
    } catch (error) {
        console.error("存储审计失败：", error);
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

if (import.meta.main) await runStorageAudit();
