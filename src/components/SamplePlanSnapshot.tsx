import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
    normalizeSamplePlanData,
} from "@/student/experiment/sample-plan-display";
import type { AdvancedPlanSnapshot } from "@/student/experiment/advanced-plan";

function ValueItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
        </div>
    );
}

function advancedPlanSummary(plan: AdvancedPlanSnapshot) {
    if (plan.kind === "domain") return `子总体 ${plan.inputs.domains.length} 个；最大需求 ${plan.result.requiredSampleSize} 人`;
    if (plan.kind === "cost") return `预算 ${plan.inputs.totalBudget.toLocaleString()} 元；单位成本 ${plan.inputs.variableCostPerUnit} 元；结果 ${plan.result.requiredSampleSize} 人`;
    if (plan.kind === "deff") return `应用 deff=${plan.result.appliedDesignEffect}`;
    if (plan.kind === "multivar") return `变量 ${plan.inputs.variables.length} 个；最大需求 ${plan.result.requiredSampleSize} 人`;
    if (plan.kind === "cv") return `目标 CV ${(plan.inputs.targetCV * 100).toFixed(1)}%；结果 ${plan.result.requiredSampleSize} 人`;
    return `平均群规模 ${plan.inputs.clusterSize}；${plan.result.requiredClusters} 个群，共 ${plan.result.requiredSampleSize} 人`;
}

const ADVANCED_KIND_LABEL: Record<AdvancedPlanSnapshot["kind"], string> = {
    domain: "子总体估计",
    cost: "成本权衡",
    deff: "设计效应参考",
    multivar: "多变量规划",
    cv: "CV-based计算",
    cluster: "整群抽样",
};

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => <ValueItem key={item.label} {...item} />)}
            </div>
            {plan.finalSampleSize !== plan.recommendedSize && (
                <p className="rounded-xl border border-info/20 bg-info/10 p-3 text-sm text-info">
                    最终采用 {plan.finalSampleSize.toLocaleString()} 个样本；常规公式推荐值为 {plan.recommendedSize.toLocaleString()}。
                </p>
            )}
            {(plan.advancedPlans?.length ?? 0) > 0 && (
                <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">已应用的高级规划依据</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                        {plan.advancedPlans!.map((advanced) => (
                            <li key={advanced.kind} className="flex items-start justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                                <span className="font-medium text-foreground">{ADVANCED_KIND_LABEL[advanced.kind]}</span>
                                <span className="text-right text-muted-foreground">{advancedPlanSummary(advanced)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
