import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronRight } from "lucide-react";
import { calculateFinitePopulationSampleSize } from "../../../experiment/sample-plan";
import { type RealWorldScenario, type SampleParams } from "../types";

interface Props {
    scenario: RealWorldScenario;
    params: SampleParams;
    onDesignEffectChange: (v: number) => void;
    onNonResponseRateChange: (v: number) => void;
    onNext: () => void;
}

export function RealWorldPhase({ scenario, params, onDesignEffectChange, onNonResponseRateChange, onNext }: Props) {
    // Base sample (no deff, no NRR)
    const baseN = calculateFinitePopulationSampleSize({
        confidenceLevel: params.confidenceLevel,
        marginOfError: params.marginOfError,
        populationSize: params.populationSize,
        designEffect: 1,
        nonResponseRate: 0,
    }) ?? 384;

    if (scenario === "deff") {
        const withDeff = calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: params.marginOfError,
            populationSize: params.populationSize,
            designEffect: params.designEffect,
            nonResponseRate: 0,
        }) ?? baseN;

        return (
            <div className="space-y-8">
                <ScenarioHeader
                    icon="🏫"
                    tag="场景 A：设计效应"
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

                <NextButton onClick={onNext} />
            </div>
        );
    }

    if (scenario === "nrr") {
        const withDeff = calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: params.marginOfError,
            populationSize: params.populationSize,
            designEffect: params.designEffect,
            nonResponseRate: 0,
        }) ?? baseN;

        const withBoth = calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: params.marginOfError,
            populationSize: params.populationSize,
            designEffect: params.designEffect,
            nonResponseRate: params.nonResponseRate,
        }) ?? withDeff;

        const nrrPct = Math.round(params.nonResponseRate * 100);
        const lost = withBoth - withDeff;

        return (
            <div className="space-y-8">
                <ScenarioHeader
                    icon="📭"
                    tag="场景 B：无回答率"
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
                            className="py-2 [&>.relative>.absolute]:bg-rose-500"
                        />
                    </div>

                    {/* Visual: sent vs received */}
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

                <NextButton onClick={onNext} />
            </div>
        );
    }

    // scenario === "summary"
    const finalN = calculateFinitePopulationSampleSize({
        confidenceLevel: params.confidenceLevel,
        marginOfError: params.marginOfError,
        populationSize: params.populationSize,
        designEffect: params.designEffect,
        nonResponseRate: params.nonResponseRate,
    }) ?? baseN;

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    完整公式
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">参数全部就位</h2>
            </div>

            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
                <div className="font-mono text-center text-lg text-slate-600 dark:text-slate-300">
                    n = n₁ × <span className="text-amber-500">deff</span> / (1 − <span className="text-rose-500">NRR</span>)
                </div>
                <div className="font-mono text-center text-sm text-slate-400 dark:text-slate-500">
                    n = {baseN} × <span className="text-amber-500">{params.designEffect.toFixed(1)}</span> / (1 − <span className="text-rose-500">{params.nonResponseRate.toFixed(2)}</span>)
                </div>
                <div className="text-center">
                    <span className="text-4xl font-bold tabular-nums text-indigo-500">{finalN.toLocaleString()}</span>
                    <span className="text-slate-400 ml-2">人</span>
                </div>
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

function ScenarioHeader({ icon, tag, title, description }: { icon: string; tag: string; title: string; description: string }) {
    return (
        <div className="text-center space-y-3">
            <div className="text-3xl">{icon}</div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-xs font-medium text-amber-700 dark:text-amber-300">
                {tag}
            </span>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{title}</h2>
            <p className="text-gray-500 dark:text-slate-400 max-w-md mx-auto">{description}</p>
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
    const pct = Math.max(3, (value / max) * 100);
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

function NextButton({ onClick }: { onClick: () => void }) {
    return (
        <div className="flex justify-center pt-2">
            <Button
                type="button"
                onClick={onClick}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
            >
                继续
                <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
        </div>
    );
}
