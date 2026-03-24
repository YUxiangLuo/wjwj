import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronRight, School, MailX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize, calculateSampleSizeSteps } from "../../../experiment/sample-plan";
import type { FourStepScenario, SampleParams } from "../types";
import type { EstimationType } from "./FormulaPhase";
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
                    title="同一群人往往更相似"
                    description={"整群抽样时，同一个班的学生观点相近，\u201C有效信息量\u201D打折扣。这个折扣就是设计效应 (deff)。"}
                />

                <div className="max-w-md mx-auto space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">1.0 (简单随机)</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-lg tabular-nums">
                                deff = {params.designEffect.toFixed(1)}
                            </span>
                            <span className="text-gray-400">5.0</span>
                        </div>
                        <Slider
                            value={[params.designEffect * 10]}
                            onValueChange={([v]) => v != null && onDesignEffectChange(Math.round(v) / 10)}
                            min={10}
                            max={50}
                            step={1}
                            aria-label="设计效应"
                            className="py-2 [&>.relative>.absolute]:bg-amber-500"
                        />
                    </div>

                    <BeforeAfterBars
                        beforeLabel="简单随机 (deff=1.0)"
                        beforeValue={baseN}
                        afterLabel={`当前 (deff=${params.designEffect.toFixed(1)})`}
                        afterValue={withDeff}
                        max={Math.max(baseN * 5, withDeff)}
                        beforeColor="bg-emerald-400 dark:bg-emerald-600"
                        afterColor="bg-amber-500"
                    />

                    {params.designEffect > 1 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 text-center animate-in fade-in duration-300">
                            需要多抽 <strong className="tabular-nums">{(withDeff - baseN).toLocaleString()}</strong> 人来弥补群内相似性
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
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">0%</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400 text-lg tabular-nums">
                                无回答率 = {nrrPct}%
                            </span>
                            <span className="text-gray-400">50%</span>
                        </div>
                        <Slider
                            value={[nrrPct]}
                            onValueChange={([v]) => v != null && onNonResponseRateChange(v / 100)}
                            min={0}
                            max={50}
                            step={5}
                            aria-label="无回答率"
                            className="py-2 [&>.relative>.absolute]:bg-rose-500"
                        />
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>发出</span>
                                <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{withBoth.toLocaleString()} 份</span>
                            </div>
                            <div className="h-5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500 w-full" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>收回有效</span>
                                <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{withDeff.toLocaleString()} 份</span>
                            </div>
                            <div className="h-5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${withBoth > 0 ? (withDeff / withBoth) * 100 : 100}%` }}
                                />
                            </div>
                        </div>
                        {lost > 0 && (
                            <p className="text-xs text-rose-500 text-center tabular-nums">
                                预计丢失 {lost.toLocaleString()} 份
                            </p>
                        )}
                    </div>
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
        const p1 = calculateFinitePopulationSampleSize({
            confidenceLevel: "95", marginOfError: 5, populationSize: 10000,
            designEffect: 1, nonResponseRate: 0.1,
        }) ?? 0;
        const domains = [
            { name: "域A (20%)", n: 2000 },
            { name: "域B (30%)", n: 3000 },
            { name: "域C (50%)", n: 5000 },
        ];
        const domainSamples = domains.map((d) => ({
            ...d,
            sample: calculateFinitePopulationSampleSize({
                confidenceLevel: "95", marginOfError: 5, populationSize: d.n,
                designEffect: 1, nonResponseRate: 0.1,
            }) ?? 0,
        }));
        return { plan1n: p1, plan2DomainSamples: domainSamples, plan2n: domainSamples.reduce((s, d) => s + d.sample, 0) };
    }, []);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    四步法汇总
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">样本量确定四步法</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm">
                    从初始公式到最终样本量的完整路径（{isProportion ? "比例估计" : "均值估计"}）
                </p>
            </div>

            {/* Four-step pipeline */}
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
                <StepRow step={1} label="初始样本量 n₀" formula={step1Formula} value={n0} color="text-indigo-500" />
                <StepArrow />
                <StepRow step={2} label="有限总体校正 n₁" formula="n₀/(1+(n₀-1)/N)" value={n1} color="text-violet-500" />
                <StepArrow />
                <StepRow step={3} label="设计效应调整 n₂" formula={`n₁×deff (${params.designEffect.toFixed(1)})`} value={n2} color="text-amber-500" />
                <StepArrow />
                <StepRow step={4} label="无回答率调整 n" formula={`n₂/(1-NRR) (${(params.nonResponseRate * 100).toFixed(0)}%)`} value={n3} color="text-emerald-600 dark:text-emerald-400" highlight />
            </div>

            {/* Plan comparison (courseware example 7.2, fixed parameters) */}
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-5 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">方案对比（课件例 7.2，N=10,000）</p>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-blue-400">方案1: 整体估计</p>
                        <p className="text-2xl font-black tabular-nums text-blue-600 dark:text-blue-400">{plan1n.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-rose-400">方案2: 各域分别估计</p>
                        <p className="text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400">{plan2n.toLocaleString()}</p>
                    </div>
                </div>
                <div className="space-y-1 pl-2">
                    {plan2DomainSamples.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-xs text-slate-500">
                            <span>{d.name} (N={d.n.toLocaleString()})</span>
                            <span className="tabular-nums">{d.sample.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                    域估计使总样本量增加约 {plan1n > 0 ? (plan2n / plan1n).toFixed(1) : "—"} 倍
                </p>
            </div>

            <div className="text-center space-y-2">
                <p className="text-gray-500 dark:text-slate-400">
                    接下来，你将在决策面板中确认或调整最终样本量。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
                >
                    进入决策面板
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
                <Icon className="w-8 h-8 text-amber-500" aria-hidden="true" />
            </div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-xs font-medium text-amber-700 dark:text-amber-300">
                {tag}
            </span>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{title}</h2>
            <p className="text-gray-500 dark:text-slate-400 max-w-md mx-auto">{description}</p>
        </div>
    );
}

function StepRow({ step, label, formula, value, color, highlight }: {
    step: number; label: string; formula: string; value: number; color: string; highlight?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 ${highlight ? "rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 -mx-1" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">{step}</span>
                <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
                    <p className="text-[10px] font-mono text-slate-400 truncate">{formula}</p>
                </div>
            </div>
            <span className={`text-lg font-bold tabular-nums flex-shrink-0 ${color}`}>{value.toLocaleString()}</span>
        </div>
    );
}

function StepArrow() {
    return (
        <div className="flex justify-center">
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
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
        <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <BarRow label={beforeLabel} value={beforeValue} max={max} color={beforeColor} />
            <BarRow label={afterLabel} value={afterValue} max={max} color={afterColor} />
        </div>
    );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
                <span>{label}</span>
                <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{value.toLocaleString()}</span>
            </div>
            <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
