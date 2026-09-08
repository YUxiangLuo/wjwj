import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { calculateSampleSizeStepDetails } from "../../../experiment/sample-plan";
import { formatSamplePlanNumber } from "../../../experiment/sample-plan-display";
import { PlanningAssumptions, PlanningHeading } from "../PlanningShared";
import type { EstimationType, FourStepScenario, SampleParams } from "../types";

interface Props {
    scenario: FourStepScenario;
    params: SampleParams;
    estimationType: EstimationType;
    populationVariance: number;
    onDesignEffectChange: (v: number) => void;
    onNonResponseRateChange: (v: number) => void;
    onNext: () => void;
    hideNext?: boolean;
}

export function FourStepPhase({ params, estimationType, populationVariance, onNext, hideNext = false }: Props) {
    const details = calculateSampleSizeStepDetails({...params, estimationType, populationVariance});
    const fmt = (n: number) => formatSamplePlanNumber(n);
    const steps = [
        { title: "先按大总体计算", formula: estimationType === "proportion" ? "n₀ = Z² × 0.5 × 0.5 / e²" : "n₀ = Z² × σ² / e²", value: details.n0Raw,
            text: estimationType === "proportion" ? "比例未知，取 p = 0.5，得到最保守的初始样本量。e 以小数比例代入，例如 5 个百分点 = 0.05。" : "使用研究目标的总体方差，误差限 e 与研究指标使用同一单位。" },
        { title: "考虑抽样设计", formula: `n₁ = n₀ × deff = ${fmt(details.n0Raw)} × ${params.designEffect}`, value: details.n1Raw,
            text: params.designEffect === 1 ? "当前 deff = 1，以简单随机抽样为基准，这一步不放大样本量。" : "先按设计效应调整初始目标完成量。设计效应需要结合研究变量和实际抽样设计判断。" },
        { title: "校正有限总体", formula: `n₂ = n₁ × N / (N − 1 + n₁)`, value: details.n2Raw,
            text: `总体只有 ${params.populationSize.toLocaleString()} 个单位。抽取其中较大一部分时，剩余的不确定性更小，因此校正会减少所需样本量。` },
        { title: "换算邀请数并向上取整", formula: `n = ⌈n₂ / (1 − ${params.nonResponseRate})⌉，最多 N`, value: details.n3,
            text: params.nonResponseRate === 0 ? `当前假设全部回答，将 ${fmt(details.n3Raw)} 向上取整，得到 ${details.n3} 个单位。` : `预期 ${(params.nonResponseRate * 100).toFixed(0)}% 不回答，需增加邀请数。只在最后向上取整，并以总体数量为上限。` },
    ];
    return <div className="space-y-6">
        <PlanningHeading title={`${details.n3} 个单位，是这样算出来的`} description="把当前实验的条件依次代入。中间步骤保留小数，只在最后向上取整，避免重复取整改变建议值。"/>
        <ol className="space-y-3">
            {steps.map((step, index) => <li key={step.title} className={`rounded-surface border p-5 ${index === 3 ? "border-primary-border bg-primary-muted" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-start gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-muted text-label font-semibold text-muted-foreground">{index+1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                        <h3 className="text-subheading font-semibold text-foreground">{step.title}</h3>
                        <p className="text-label text-muted-foreground leading-relaxed">{step.text}</p>
                        <p className="break-words font-mono text-meta text-muted-foreground">{step.formula}</p>
                    </div>
                    <p className={`text-right text-section-title font-bold tabular-nums ${index===3 ? "text-primary" : "text-foreground"}`}>{fmt(step.value)}</p>
                </div>
            </li>)}
        </ol>
        {details.n3 >= params.populationSize && <p className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">已达总体数量上限。{params.nonResponseRate > 0 ? "全体发放仍可能无法获得足够的有效回答，请在调整方案时查看预期精度。" : "只有全部单位都完成回答时，才相当于完整普查。"}</p>}
        <PlanningAssumptions params={params}/>
        {!hideNext && <Button onClick={onNext}>继续：调整方案<ArrowRight className="ml-2 h-4 w-4"/></Button>}
    </div>;
}
