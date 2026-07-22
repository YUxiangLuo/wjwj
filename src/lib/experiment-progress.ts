type ProgressRecord = {
    status: "in_progress" | "submitted" | "graded" | "rejected";
    currentStage: number;
    stage4CompletedAt?: unknown;
};

export function experimentProgress(record: ProgressRecord | null) {
    if (!record) return 0;
    if (record.status === "submitted" || record.status === "graded") return 100;

    const stageProgress = Math.max(0, Math.min(75, (record.currentStage - 1) * 25));
    if (record.status === "rejected") return stageProgress;
    return record.stage4CompletedAt ? 100 : stageProgress;
}
