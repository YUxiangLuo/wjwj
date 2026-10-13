import { ExperimentStatus } from "../../domain/experiment/status";
import { resolveStoragePath } from "../../server/storage-files";
import { parseStoredJson } from "./serialization";

export async function matchesSnapshotFile(path: string | null, expected: unknown) {
    if (!path || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) return false;
    try {
        const bytes = await Bun.file(resolveStoragePath(path)).arrayBuffer();
        return new Bun.CryptoHasher("sha256").update(bytes).digest("hex") === expected;
    } catch {
        return false;
    }
}

// Editable work may retain an earlier submission snapshot after rejection.
export async function getSubmissionSourceConflict(
    record: { status: string; submissionSnapshot: unknown },
    path: string | null,
) {
    if (record.status !== ExperimentStatus.SUBMITTED && record.status !== ExperimentStatus.GRADED) return null;
    const snapshot = parseStoredJson<{ populationFileSha256?: unknown }>(record.submissionSnapshot);
    if (await matchesSnapshotFile(path, snapshot?.populationFileSha256)) return null;
    return {
        ok: false as const,
        code: "SOURCE_CONFLICT",
        message: "提交时总体文件已变化，无法恢复冻结样本",
    };
}
