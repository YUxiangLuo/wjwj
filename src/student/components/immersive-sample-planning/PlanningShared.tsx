import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { calculatePlannedPrecision, formatPlanningError } from "../../experiment/planned-precision";
import { formatSamplePlanNumber } from "../../experiment/sample-plan-display";
import type { SampleParams } from "./types";

export function PlanningHeading({ title, description }: { title: string; description: string }) {
    return <PageHeader border={false} className="items-start">
        <div className="space-y-2">
            <h2 tabIndex={-1} className="text-page-title font-bold text-foreground outline-none">{title}</h2>
            <p className="text-body text-muted-foreground leading-relaxed">{description}</p>
        </div>
    </PageHeader>;
}

export function PlanningAssumptions({ params }: { params: SampleParams }) {
    return <p className="text-meta text-muted-foreground leading-relaxed">
        {params.estimationType === "proportion"
            ? "比例未知，按 p = 0.5 保守规划。"
            : params.populationVariance == null
                ? "均值规划需要研究目标的总体方差，误差与该指标同单位。"
                : `按研究目标的总体方差 σ² = ${formatSamplePlanNumber(params.populationVariance)} 规划，误差与该指标同单位。`}
        {params.designEffect === 1 ? "以简单随机不放回抽样为基准" : `假设设计效应为 ${params.designEffect}`}，
        {params.nonResponseRate === 0 ? "假设全部单位完成回答" : `预期无回答率为 ${Math.round(params.nonResponseRate * 100)}%`}。
        结果为有限总体下的近似规划精度；实际抽样方法与回答情况会影响最终结果。
    </p>;
}

export function PlanningOutcome({ params, sampleSize = params.finalSampleSize }: { params: SampleParams; sampleSize?: number }) {
    const precision = calculatePlannedPrecision(params, sampleSize);
    if (!precision) return <p role="alert" className="text-label text-destructive">请填写有效的样本量和规划参数后查看精度。</p>;
    return <div className="space-y-3" data-testid="planning-outcome" aria-live="polite" aria-atomic="true">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label font-medium text-foreground">{params.advancedPlanSource ? "按基础参数评估当前样本量" : "当前选择的预期精度"}</p>
            <StatusBadge intent={precision.meetsTarget ? "success" : "warning"}>
                {precision.meetsTarget ? "预计达到目标" : "预计未达到目标"}
            </StatusBadge>
        </div>
        <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-surface bg-muted p-3">
                <dt className="text-meta text-muted-foreground">预期误差限 · {params.confidenceLevel}% 置信</dt>
                <dd className="mt-1 text-subheading font-semibold tabular-nums text-foreground">{formatPlanningError(precision.marginOfError, params.estimationType)}</dd>
            </div>
            <div className="rounded-surface bg-muted p-3">
                <dt className="text-meta text-muted-foreground">目标误差限</dt>
                <dd className="mt-1 text-subheading font-semibold tabular-nums text-foreground">{formatPlanningError(precision.targetMargin, params.estimationType)}</dd>
            </div>
        </dl>
        {params.nonResponseRate > 0 && <p className="text-meta text-muted-foreground">计划邀请 {sampleSize} 个单位，预期完成约 {formatSamplePlanNumber(precision.expectedCompleted)} 个有效样本；增加邀请数不能消除无回答偏差。</p>}
        {precision.expectedCompleted >= params.populationSize && <p role="status" className="rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning">该方案覆盖全部 {formatSamplePlanNumber(params.populationSize)} 个总体单位，属于完整普查：预期抽样误差为 0，各抽样方法的估计结果会完全相同，无法进行方法间比较。若教学目标是比较抽样方法，请增大总体规模或选择更大的误差限。</p>}
        {!precision.meetsTarget && <p className="text-label text-warning">可以保留这个样本量用于探索，但应在报告中说明未达到当前精度目标。</p>}
        {params.advancedPlanSource && <p className="text-meta text-muted-foreground">高级工具的目标和假设可能不同，请同时查看已保存的工具方案。</p>}
    </div>;
}
