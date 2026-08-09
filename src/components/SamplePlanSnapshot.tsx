import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
    normalizeSamplePlanData,
} from "@/student/experiment/sample-plan-display";

function ValueItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
        </div>
    );
}

export function SamplePlanSnapshot({
    value,
    populationSize,
    emptyText = "暂无抽样方案",
}: {
    value: unknown;
    populationSize?: number | null;
    emptyText?: string;
}) {
    const plan = normalizeSamplePlanData(value, populationSize);
    if (!plan) {
        return <p className="text-sm text-muted-foreground">{emptyText}</p>;
    }

    const advancedSource = getAdvancedPlanSourceLabel(plan.advancedPlanSource);
    const items = [
        { label: "估计类型", value: getEstimationTypeLabel(plan.estimationType) },
        { label: "置信水平", value: `${plan.confidenceLevel}%` },
        {
            label: getMarginOfErrorLabel(plan.estimationType),
            value: plan.estimationType === "mean"
                ? `${formatMarginOfError(plan.marginOfError, plan.estimationType)}（与均值同单位）`
                : formatMarginOfError(plan.marginOfError, plan.estimationType),
        },
        ...(plan.estimationType === "mean" && plan.populationVariance != null
            ? [{ label: "总体方差 σ²", value: String(plan.populationVariance) }]
            : []),
        { label: "设计效应 deff", value: plan.designEffect.toFixed(2) },
        { label: "预期无回答率", value: `${Math.round(plan.nonResponseRate * 100)}%` },
        { label: "推荐样本量", value: plan.recommendedSize.toLocaleString() },
        { label: "最终样本量", value: plan.finalSampleSize.toLocaleString() },
        ...(advancedSource ? [{ label: "最终样本量来源", value: `${advancedSource}（高级工具）` }] : []),
    ];

    return (
        <div className="space-y-4" data-testid="sample-plan-snapshot">
            {populationSize && populationSize > 0 ? (
                <p className="text-sm text-muted-foreground">总体规模 N = {populationSize.toLocaleString()}</p>
            ) : null}
            <div className="grid gap-3 grid-cols-3">
                {items.map((item) => <ValueItem key={item.label} {...item} />)}
            </div>
            {plan.finalSampleSize !== plan.recommendedSize && (
                <p className="rounded-xl border border-info/20 bg-info/10 p-3 text-sm text-info">
                    最终采用 {plan.finalSampleSize.toLocaleString()} 个样本；常规公式推荐值为 {plan.recommendedSize.toLocaleString()}。
                </p>
            )}
        </div>
    );
}
