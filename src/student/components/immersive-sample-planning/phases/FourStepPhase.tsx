import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronRight, School, MailX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize, calculateSampleSizeSteps } from "../../../experiment/sample-plan";
import type { EstimationType, FourStepScenario, SampleParams } from "../types";
import { PhaseNextButton } from "./shared";

interface Props {
    scenario: FourStepScenario;
    params: SampleParams;
    estimationType: EstimationType;
    populationVariance: number;
    onDesignEffectChange: (v: number) => void;
    onNonResponseRateChange: (v: number) => void;
    onNext: () => void;
}

function computeBaseN(params: SampleParams, estimationType: EstimationType, populationVariance: number, deff: number, nrr: number): number {
    if (estimationType === "mean") {
        return calculateMeanEstimationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: params.marginOfError,
            populationSize: params.populationSize,
            populationVariance,
            designEffect: deff,
            nonResponseRate: nrr,
        }) ?? 0;
    }
    return calculateFinitePopulationSampleSize({
        confidenceLevel: params.confidenceLevel,
        marginOfError: params.marginOfError,
        populationSize: params.populationSize,
        designEffect: deff,
        nonResponseRate: nrr,
    }) ?? 0;
}

export function FourStepPhase({ scenario, params, estimationType, populationVariance, onDesignEffectChange, onNonResponseRateChange, onNext }: Props) {
    const baseN = computeBaseN(params, estimationType, populationVariance, 1, 0);

    if (scenario === "deff") {
        const withDeff = computeBaseN(params, estimationType, populationVariance, params.designEffect, 0);

        return (
            <div className="space-y-8">
                <ScenarioHeader
                    icon={School}
                    tag="Step 3: 设计效应"
                    title="复杂抽法会改变有效信息量"
                    description={"设计效应 deff 是复杂抽样方差相对简单随机抽样的倍数。整群抽样里同一班学生观点相近时，deff 常常大于 1。这里只用来调整建议发放量，后面执行的仍是简单随机、系统、PPS 或分层。"}
                />

                <div className="max-w-md mx-auto space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-label">
                            <span className="text-muted-foreground">1.0 (简单随机)</span>
                            <span className="font-bold text-warning text-subheading tabular-nums">
                                deff = {params.designEffect.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground">5.0</span>
                        </div>
                        <Slider
                            value={[params.designEffect * 10]}
                            onValueChange={([v]) => v != null && onDesignEffectChange(Math.round(v) / 10)}
                            min={10}
                            max={50}
                            step={1}
                            aria-label="设计效应"
                            className="py-2 [&>.relative>.absolute]:bg-warning"
                        />
                    </div>

                    <BeforeAfterBars
                        beforeLabel="简单随机 (deff=1.0)"
                        beforeValue={baseN}
                        afterLabel={`当前 (deff=${params.designEffect.toFixed(1)})`}
                        afterValue={withDeff}
                        max={Math.max(baseN * 5, withDeff)}
                        beforeColor="bg-success"
                        afterColor="bg-warning"
                    />

                    {params.designEffect > 1 && (
                        <p className="text-label text-warning text-center animate-in fade-in duration-300">
                            需要多抽 <strong className="tabular-nums">{(withDeff - baseN).toLocaleString()}</strong> 人，才能达到与简单随机抽样相近的精度
                        </p>
                    )}
                </div>

                <PhaseNextButton onClick={onNext} />
            </div>
        );
    }

    if (scenario === "nrr") {
        const withDeff = computeBaseN(params, estimationType, populationVariance, params.designEffect, 0);
        const withBoth = computeBaseN(params, estimationType, populationVariance, params.designEffect, params.nonResponseRate);

        const nrrPct = Math.round(params.nonResponseRate * 100);
        const lost = withBoth - withDeff;

        return (
            <div className="space-y-8">
                <ScenarioHeader
                    icon={MailX}
                    tag="Step 4: 无回答率"
                    title="不是所有人都会回应"
                    description={`你发出问卷，但只收回 ${100 - nrrPct}%。为拿到足够有效问卷，需要多发一些。`}
                />

                <div className="max-w-md mx-auto space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-label">
                            <span className="text-muted-foreground">0%</span>
                            <span className="font-bold text-destructive text-subheading tabular-nums">
                                无回答率 = {nrrPct}%
                            </span>
                            <span className="text-muted-foreground">50%</span>
                        </div>
                        <Slider
                            value={[nrrPct]}
                            onValueChange={([v]) => v != null && onNonResponseRateChange(v / 100)}
                            min={0}
                            max={50}
                            step={5}
                            aria-label="无回答率"
                            className="py-2 [&>.relative>.absolute]:bg-destructive"
                        />
                    </div>

                    <div className="rounded-surface border border-border bg-card p-4 space-y-3">
                        <div className="space-y-1">
                            <div className="flex justify-between text-meta text-muted-foreground">
                                <span>发出</span>
                                <span className="tabular-nums font-medium text-foreground">{withBoth.toLocaleString()} 份</span>
                            </div>
                            <div className="h-5 rounded-control bg-input overflow-hidden">
                                <div className="h-full rounded-control bg-input w-full" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-meta text-muted-foreground">
                                <span>收回有效</span>
                                <span className="tabular-nums font-medium text-success">{withDeff.toLocaleString()} 份</span>
                            </div>
                            <div className="h-5 rounded-control bg-input overflow-hidden">
                                <div
                                    className="h-full rounded-control bg-success transition-[width] duration-300"
                                    style={{ width: `${withBoth > 0 ? (withDeff / withBoth) * 100 : 100}%` }}
                                />
                            </div>
                        </div>
                        {lost > 0 && (
                            <p className="text-meta text-destructive text-center tabular-nums">
                                预计丢失 {lost.toLocaleString()} 份
                            </p>
                        )}
                    </div>
                    <p className="rounded-surface border border-warning-border bg-warning-muted p-3 text-meta leading-relaxed text-warning">
                        n₂/(1−NRR) 只是在回答率假设下补足预期完成数量。若回答概率与研究变量相关，扩大初始发放量不能消除无回答偏差，还需跟访、权重调整或专门的无回答分析。
                    </p>
                </div>

                <PhaseNextButton onClick={onNext} />
            </div>
        );
    }

    // scenario === "summary"
    const isProportion = estimationType === "proportion";

    const { n0, n1, n2, n3, formulaLabel: step1Formula } = calculateSampleSizeSteps({
        estimationType,
        confidenceLevel: params.confidenceLevel,
        marginOfError: params.marginOfError,
        populationSize: params.populationSize,
        populationVariance,
        designEffect: params.designEffect,
        nonResponseRate: params.nonResponseRate,
    });

    const { plan1n, plan2DomainSamples, plan2n } = useMemo(() => {
        const p1 = estimationType === "mean"
            ? calculateMeanEstimationSampleSize({
                confidenceLevel: "95",
                marginOfError: params.marginOfError,
                populationSize: 10000,
                populationVariance,
                designEffect: 1,
                nonResponseRate: 0.1,
            }) ?? 0
            : calculateFinitePopulationSampleSize({
                confidenceLevel: "95", marginOfError: 5, populationSize: 10000,
                designEffect: 1, nonResponseRate: 0.1,
            }) ?? 0;
        const domains = [
            { name: "东部地区 (20%)", n: 2000 },
            { name: "中部地区 (30%)", n: 3000 },
            { name: "西部地区 (50%)", n: 5000 },
        ];
        const domainSamples = domains.map((d) => ({
            ...d,
            sample: estimationType === "mean"
                ? calculateMeanEstimationSampleSize({
                    confidenceLevel: "95",
                    marginOfError: params.marginOfError,
                    populationSize: d.n,
                    populationVariance,
                    designEffect: 1,
                    nonResponseRate: 0.1,
                }) ?? 0
                : calculateFinitePopulationSampleSize({
                    confidenceLevel: "95", marginOfError: 5, populationSize: d.n,
                    designEffect: 1, nonResponseRate: 0.1,
                }) ?? 0,
        }));
        return { plan1n: p1, plan2DomainSamples: domainSamples, plan2n: domainSamples.reduce((s, d) => s + d.sample, 0) };
    }, [estimationType, params.marginOfError, populationVariance]);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-control bg-success-muted text-meta font-medium text-success">
                    四步法汇总
                </span>
                <h2 className="text-page-title font-bold text-foreground">样本量确定四步法</h2>
                <p className="text-muted-foreground text-label">
                    现在把前面的判断全部串起来，得到真正用于调查规划的最终样本量（{isProportion ? "比例估计" : "均值估计"}）
                </p>
            </div>

            {/* Four-step pipeline */}
            <div className="mx-auto max-w-md rounded-surface border border-border bg-background p-5 space-y-3">
                <StepRow step={1} label="初始样本量 n₀" formula={step1Formula} value={n0} color="text-primary" />
                <StepArrow />
                <StepRow step={2} label="设计效应调整 n₁" formula={`n₀×deff (${params.designEffect.toFixed(1)})`} value={n1} color="text-warning" />
                <StepArrow />
                <StepRow step={3} label="有限总体校正 n₂" formula="n₁N/(N−1+n₁)" value={n2} color="text-auxiliary" />
                <StepArrow />
                <StepRow step={4} label="计划邀请数 n" formula={`n₂/(1-NRR) (${(params.nonResponseRate * 100).toFixed(0)}%)`} value={n3} color="text-success" highlight />
                {n3 >= params.populationSize && params.populationSize > 0 && (
                    <p className="text-meta text-warning text-center">
                        膨胀后的发放量已封顶为总体 N = {params.populationSize.toLocaleString()}。
                        {params.nonResponseRate > 0
                            ? "这是向全体尝试发放；预期仍有无回答，不等于完整普查，也不能消除无回答偏差。"
                            : "在全部单位都完成回答的假设下，这相当于完整普查。"}
                    </p>
                )}
            </div>

            {/* Plan comparison (mutually exclusive strata) */}
            <div className="mx-auto max-w-md rounded-surface border border-border bg-card p-5 space-y-3">
                <p className="text-meta font-medium uppercase tracking-wider text-muted-foreground">
                    {isProportion
                        ? "方案对比（课件例 7.2，互斥分层，N=10,000）"
                        : `方案对比（互斥分层，σ²=${populationVariance}，e=${params.marginOfError}，N=10,000）`}
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-surface bg-info-muted p-3 text-center">
                        <p className="text-meta font-medium uppercase tracking-wider text-info">方案1: 整体估计</p>
                        <p className="text-page-title font-black tabular-nums text-info">{plan1n.toLocaleString()}</p>
                    </div>
                    <div className="rounded-surface bg-destructive-muted p-3 text-center">
                        <p className="text-meta font-medium uppercase tracking-wider text-destructive">方案2: 各层分别估计</p>
                        <p className="text-page-title font-black tabular-nums text-destructive">{plan2n.toLocaleString()}</p>
                    </div>
                </div>
                <div className="space-y-1 pl-2">
                    {plan2DomainSamples.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-meta text-muted-foreground">
                            <span>{d.name} (N={d.n.toLocaleString()})</span>
                            <span className="tabular-nums">{d.sample.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                <p className="text-meta text-warning text-center">
                    当三个层互不重叠且都要单独达标时，总样本量约增加 {plan1n > 0 ? (plan2n / plan1n).toFixed(1) : "—"} 倍
                </p>
            </div>

            <div className="text-center space-y-2">
                <p className="text-muted-foreground">
                    到这里，样本量规划的计算部分已经结束。下一步确认的 n 会直接带入抽样执行阶段。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground px-8 py-5 rounded-surface "
                >
                    继续：进入决策面板
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}

// --- Sub-components ---

function ScenarioHeader({ icon: Icon, tag, title, description }: { icon: LucideIcon; tag: string; title: string; description: string }) {
    return (
        <div className="text-center space-y-3">
            <div className="flex justify-center">
                <Icon className="w-8 h-8 text-warning" aria-hidden="true" />
            </div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-control bg-warning-muted text-meta font-medium text-warning">
                {tag}
            </span>
            <h2 className="text-page-title font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
        </div>
    );
}

function StepRow({ step, label, formula, value, color, highlight }: {
    step: number; label: string; formula: string; value: number; color: string; highlight?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 ${highlight ? "rounded-surface bg-success-muted p-3 -mx-1" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-control bg-muted flex items-center justify-center text-meta font-bold text-muted-foreground">{step}</span>
                <div className="min-w-0">
                    <p className="text-meta font-medium text-muted-foreground truncate">{label}</p>
                    <p className="text-meta font-mono text-muted-foreground truncate">{formula}</p>
                </div>
            </div>
            <span className={`text-subheading font-bold tabular-nums flex-shrink-0 ${color}`}>{value.toLocaleString()}</span>
        </div>
    );
}

function StepArrow() {
    return (
        <div className="flex justify-center">
            <div className="w-px h-3 bg-input" />
        </div>
    );
}

function BeforeAfterBars({
    beforeLabel, beforeValue, afterLabel, afterValue, max, beforeColor, afterColor,
}: {
    beforeLabel: string; beforeValue: number; afterLabel: string; afterValue: number;
    max: number; beforeColor: string; afterColor: string;
}) {
    return (
        <div className="space-y-3 rounded-surface border border-border bg-card p-4">
            <BarRow label={beforeLabel} value={beforeValue} max={max} color={beforeColor} />
            <BarRow label={afterLabel} value={afterValue} max={max} color={afterColor} />
        </div>
    );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-meta text-muted-foreground">
                <span>{label}</span>
                <span className="font-bold tabular-nums text-foreground">{value.toLocaleString()}</span>
            </div>
            <div className="h-4 rounded-control bg-input overflow-hidden">
                <div className={`h-full rounded-control ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
