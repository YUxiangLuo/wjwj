import { parseAdvancedPlans } from "@/student/experiment/advanced-plan";
import { calculateCostPlan } from "@/student/experiment/cost-plan";
import { getAdvancedPlanSourceLabel, formatSamplePlanNumber as number } from "@/student/experiment/sample-plan-display";
import { formatDateTimeDisplay } from "@/utils/format";
import { StatusBadge } from "./StatusBadge";

/** Saved assumptions must accompany the applied n, especially when they differ from the baseline. */
export function AdvancedPlanDetails({ value, source, populationSize }: { value: unknown; source?: string; populationSize?: number | null }) {
    if (value == null) return source ? <p className="text-label text-warning">历史记录缺少高级工具输入快照，无法核实该样本量的规划假设。</p> : null;
    const plans = parseAdvancedPlans(value);
    if (!plans) return <p className="text-label text-warning">高级工具快照参数无效，无法核实规划结果。</p>;
    if (!plans.length) return null;
    return <div className="space-y-3" data-testid="advanced-plan-details">
        <p className="text-label text-muted-foreground">以下为应用时保存的高级工具假设与结果。基础参数单独保留；结果分析中的置信水平与目标误差限仍采用基础参数。</p>
        {plans.map(plan => {
            const rows: Array<[string, string]> = [];
            let status: string | null = null;
            let reached = false;
            switch (plan.kind) {
                case "cost": {
                    rows.push(["规划对象", "比例，p=0.5"], ["工具置信水平", `${plan.inputs.confidenceLevel}%`], ["工具目标误差限", `±${number(plan.inputs.targetMarginOfError)} 个百分点`],
                        ["工具设计效应", number(plan.inputs.designEffect)], ["工具无回答率", `${number(plan.inputs.nonResponseRate * 100)}%`],
                        ["固定 / 单位成本", `¥${number(plan.inputs.fixedCost)} / ¥${number(plan.inputs.variableCostPerUnit)}`], ["总预算 / 预估成本", `¥${number(plan.inputs.totalBudget)} / ¥${number(plan.result.totalCost)}`]);
                    const result = populationSize ? calculateCostPlan(plan.inputs, populationSize) : null;
                    if (result) {
                        rows.push(["预期完成量", number(result.expectedCompleted)], ["预期误差限", `±${number(result.marginOfError * 100)} 个百分点`]);
                        reached = result.isFeasible;
                        status = `${result.budgetFeasible ? "预算充足" : "超预算"}；${result.precisionReached ? "预期精度达标" : "预期精度未达标"}`;
                    } else status = "缺少有效总体规模，无法复核精度";
                    break;
                }
                case "cv":
                    rows.push(["工具置信水平（仅用于区间换算）", `${plan.inputs.confidenceLevel}%`], ["目标设计 CV / 假设总体 CV", `${number(plan.inputs.targetCV)}% / ${number(plan.inputs.estimatedCV)}%`],
                        ["工具设计效应 / 无回答率", `${number(plan.inputs.designEffect)} / ${number(plan.inputs.nonResponseRate)}%`], ["预期完成量", number(plan.result.expectedRespondentSampleSize)], ["预期设计 CV", `${number(plan.result.achievedCV * 100)}%`]);
                    reached = plan.result.achievedCV <= plan.inputs.targetCV / 100 + 1e-12;
                    status = reached ? "预期设计 CV 达标" : "预期设计 CV 未达标";
                    break;
                case "cluster":
                    rows.push(["工具置信水平 / 目标误差限", `${plan.inputs.confidenceLevel}% / ±${number(plan.inputs.marginOfError)} 个百分点`], ["规划群规模", number(plan.inputs.clusterSize)],
                        ["工具设计效应 / 无回答率", `${number(plan.inputs.designEffect)} / ${number(plan.inputs.nonResponseRate)}%`], ["推荐群数 / 隐含群内相关系数", `${plan.result.requiredClusters} / ${number(plan.result.intraClassCorrelation)}`]);
                    break;
                case "multivar":
                    for (const variable of plan.inputs.variables) rows.push([variable.name,
                        `${variable.type === "mean" ? `均值 ${number(variable.estimatedValue)}，标准差 ${number(variable.estimatedStdDev!)}` : `比例 p=${number(variable.estimatedValue)}`}；置信水平 ${variable.confidenceLevel}%；${variable.type === "mean" ? "相对误差限" : "误差限（百分点）"} ±${number(variable.marginOfError)}${variable.type === "mean" ? "%" : ""}；n=${variable.requiredSampleSize}`]);
                    break;
            }
            return <section key={`${plan.kind}-${plan.appliedAt}`} className="space-y-2 rounded-surface border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2"><p className="text-subheading">{getAdvancedPlanSourceLabel(plan.kind)}快照</p>{plan.kind === source && <StatusBadge intent="primary">最终样本量来源</StatusBadge>}</div>
                <p className="text-meta text-muted-foreground">应用时间：{formatDateTimeDisplay(plan.appliedAt)}；工具推荐发放量：{plan.result.requiredSampleSize.toLocaleString()}</p>
                <dl className="space-y-2">{rows.map(([label, value]) => <div key={label} className="text-label"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-foreground">{value}</dd></div>)}</dl>
                {status && <StatusBadge intent={reached ? "success" : "warning"}>{status}</StatusBadge>}
            </section>;
        })}
    </div>;
}
