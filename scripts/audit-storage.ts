import { readdir, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { sql } from "drizzle-orm";
import type { db as appDb } from "../src/db";
import { topic, topicAttachment } from "../src/db/schema";
import { acquireStorageMutationLock } from "../src/db/storage-mutation-lock";
import { resolveStoragePath } from "../src/server/storage-files";

const storageRoot = resolve(process.cwd(), "storage");

export interface AuditStorageOptions {
    shouldDelete: boolean;
    verifyReferences: boolean;
    confirmToken?: string;
}

export function parseAuditArgs(argv: string[]): AuditStorageOptions {
    const argSet = new Set(argv);
    const confirmToken = argv
        .find((arg) => arg.startsWith("--confirm="))
        ?.slice("--confirm=".length);
    return {
        shouldDelete: argSet.has("--delete"),
        verifyReferences: argSet.has("--verify-references"),
        confirmToken,
    };
}

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

type StorageReferenceReader = Pick<typeof appDb, "execute" | "select">;

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
            .from(topic);
        for (const row of topics) addReference(references, row.path);
    }
    if (state?.attachment_table && state.topic_table) {
        const attachments = await client
            .select({ path: topicAttachment.filePath })
            .from(topicAttachment);
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

export interface StorageAuditSummary {
    referenceCount: number;
    fileCount: number;
    orphans: string[];
    missingReferences: string[];
    orphanTotalBytes: number;
    deletionToken: string;
}

export function auditStorageSnapshot(params: {
    files: string[];
    references: Set<string>;
    cwd?: string;
    fileSize?: (path: string) => number;
}): StorageAuditSummary {
    const cwd = params.cwd ?? process.cwd();
    const getSize = params.fileSize ?? ((path: string) => Bun.file(path).size);
    const fileSet = new Set(params.files);
    const orphans = params.files
        .filter((path) => !path.endsWith(`${sep}.gitkeep`) && !params.references.has(path))
        .sort();
    const missingReferences = [...params.references]
        .filter((path) => !fileSet.has(path))
        .sort();
    const orphanTotalBytes = orphans.reduce((sum, path) => sum + getSize(path), 0);
    const deletionToken = storageDeletionToken(orphans.map((path) => ({
        path: relative(cwd, path),
        size: getSize(path),
    })));
    return {
        referenceCount: params.references.size,
        fileCount: params.files.length,
        orphans,
        missingReferences,
        orphanTotalBytes,
        deletionToken,
    };
}

export async function executeStorageAudit(params: {
    files: string[];
    references: Set<string>;
    options: AuditStorageOptions;
    cwd?: string;
    fileSize?: (path: string) => number;
    unlinkFile?: (path: string) => Promise<void>;
    log?: (message: string) => void;
    warn?: (message: string) => void;
}) {
    const cwd = params.cwd ?? process.cwd();
    const unlinkFile = params.unlinkFile ?? ((path: string) => unlink(path));
    const log = params.log ?? ((message: string) => console.log(message));
    const warn = params.warn ?? ((message: string) => console.warn(message));
    const summary = auditStorageSnapshot({
        files: params.files,
        references: params.references,
        cwd,
        fileSize: params.fileSize,
    });

    log(`数据库引用文件：${summary.referenceCount}`);
    log(`存储文件总数：${summary.fileCount}`);
    log(`未引用文件：${summary.orphans.length}（${(summary.orphanTotalBytes / 1024 / 1024).toFixed(2)} MiB）`);
    for (const path of summary.orphans) log(`  ${relative(cwd, path)}`);
    log(`缺失引用文件：${summary.missingReferences.length}`);
    for (const path of summary.missingReferences) warn(`  [缺失] ${relative(cwd, path)}`);

    if (summary.missingReferences.length > 0) {
        if (params.options.verifyReferences) {
            throw new Error(
                `发现 ${summary.missingReferences.length} 个数据库引用的存储文件缺失，请先核对配套 storage/ 恢复后再继续`,
            );
        }
        warn(
            `警告：发现 ${summary.missingReferences.length} 个数据库引用的存储文件缺失；恢复验收请运行 bun run storage:audit --verify-references`,
        );
    }

    if (params.options.shouldDelete) {
        if (!params.options.confirmToken || params.options.confirmToken !== summary.deletionToken) {
            throw new Error(
                `删除确认不匹配；请先运行 storage:audit，再执行 bun run storage:clean --confirm=${summary.deletionToken}`,
            );
        }
        for (const path of summary.orphans) await unlinkFile(path);
        log(`已删除 ${summary.orphans.length} 个未引用文件。`);
    } else if (summary.orphans.length > 0) {
        log(`当前仅审计，未删除文件。确认列表后运行 bun run storage:clean --confirm=${summary.deletionToken}`);
    }

    return summary;
}

export async function runStorageAudit(argv: string[] = process.argv.slice(2)) {
    const options = parseAuditArgs(argv);
    const { closeDatabase, db } = await import("../src/db");
    try {
        await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [files, references] = await Promise.all([listFiles(storageRoot), loadReferences(tx)]);
            await executeStorageAudit({ files, references, options });
        });
    } catch (error) {
        console.error("存储审计失败：", error);
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}

if (import.meta.main) await runStorageAudit();
