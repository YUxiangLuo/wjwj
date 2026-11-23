import type { ExperimentStatusValue } from "../domain/experiment/status";

type ProgressRecord = {
    status: ExperimentStatusValue;
    currentStage: number;
    stage4CompletedAt?: unknown;
    stage5CompletedAt?: unknown;
};

export const EXPERIMENT_STAGE_NAMES = [
    "商业问卷设计",
    "首轮试投发放",
    "回收质检与诊断",
    "调整思路与二轮投放",
    "商务分析与决策报告",
] as const;

export function experimentProgress(record: ProgressRecord | null) {
    if (!record) return 0;
    if (record.status === "submitted" || record.status === "graded") return 100;

    const stageProgress = Math.max(0, Math.min(80, (record.currentStage - 1) * 20));
    if (record.status === "rejected") return stageProgress;
    return record.stage5CompletedAt ? 100 : stageProgress;
}
