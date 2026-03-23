import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ChevronRight } from "lucide-react";
import { Z_VALUES, type FormulaStep, type SampleParams } from "../types";

interface Props {
    step: FormulaStep;
    params: SampleParams;
    onConfidenceLevelChange: (v: string) => void;
    onMarginOfErrorChange: (v: number) => void;
    onNext: () => void;
}

function n0Value(z: number, e: number, p = 0.5): number {
    return (z * z * p * (1 - p)) / (e * e);
}

export function FormulaPhase({ step, params, onConfidenceLevelChange, onMarginOfErrorChange, onNext }: Props) {
    const z = Z_VALUES[params.confidenceLevel] ?? 1.96;
    const E = params.marginOfError / 100;
    const n0 = n0Value(z, E);

    if (step === "z") {
        return (
            <div className="space-y-8">
                <StepHeader current={1} total={3} />

                <div className="text-center space-y-2">
                    <FormulaDisplay
                        parts={[
                            { text: "n₀ = ( ", dim: true },
                            { text: "Z²", highlight: "indigo" },
                            { text: " × 0.25 ) / E²", dim: true },
                        ]}
                    />
                    <p className="text-gray-500 dark:text-slate-400 mt-4 text-lg">
                        如果做 100 次同样的调查，<br />
                        你希望有多少次结果是"靠谱的"？
                    </p>
                </div>

                <div className="max-w-sm mx-auto space-y-3">
                    <Select value={params.confidenceLevel} onValueChange={onConfidenceLevelChange}>
                        <SelectTrigger className="h-14 text-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="90">
                                <span className="flex items-center gap-2">90 次 (Z = 1.645) — 宽松</span>
                            </SelectItem>
                            <SelectItem value="95">
                                <span className="flex items-center gap-2">95 次 (Z = 1.96) — 标准 ✓</span>
                            </SelectItem>
                            <SelectItem value="99">
                                <span className="flex items-center gap-2">99 次 (Z = 2.576) — 严谨</span>
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 p-4 text-center">
                        <p className="text-sm text-indigo-600 dark:text-indigo-300 mb-1">
                            Z = {z}　→　当前 n₀ =
                        </p>
                        <p className="text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                            {Math.ceil(n0).toLocaleString()}
                        </p>
                    </div>

                    <p className="text-sm text-gray-400 dark:text-slate-500 text-center">
                        越想"靠谱"，需要的样本越多
                    </p>
                </div>

                <NextButton onClick={onNext} />
            </div>
        );
    }

    if (step === "e") {
        return (
            <div className="space-y-8">
                <StepHeader current={2} total={3} />

                <div className="text-center space-y-2">
                    <FormulaDisplay
                        parts={[
                            { text: `n₀ = ( ${z}² × 0.25 ) / `, dim: true },
                            { text: "E²", highlight: "teal" },
                        ]}
                    />
                    <p className="text-gray-500 dark:text-slate-400 mt-4 text-lg">
                        你能容忍多大的误差？
                    </p>
                    <p className="text-gray-400 dark:text-slate-500 text-sm">
                        "真实值是 50%，你的调查结果在 ±E 范围内"
                    </p>
                </div>

                <div className="max-w-sm mx-auto space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">1% (精确)</span>
                            <span className="font-bold text-teal-600 dark:text-teal-400 text-lg tabular-nums">
                                ±{params.marginOfError}%
                            </span>
                            <span className="text-gray-400">10% (粗略)</span>
                        </div>
                        <Slider
                            value={[params.marginOfError]}
                            onValueChange={([v]) => v != null && onMarginOfErrorChange(v)}
                            min={1}
                            max={10}
                            step={1}
                            className="py-2 [&>.relative>.absolute]:bg-teal-500"
                        />
                    </div>

                    {/* Error range visual */}
                    <ErrorRangeVisual margin={params.marginOfError} />

                    <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/30 p-4 text-center">
                        <p className="text-sm text-teal-600 dark:text-teal-300 mb-1">
                            E = {params.marginOfError}%　→　当前 n₀ =
                        </p>
                        <p className="text-3xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
                            {Math.ceil(n0).toLocaleString()}
                        </p>
                    </div>

                    <p className="text-sm text-gray-400 dark:text-slate-500 text-center">
                        误差越小，需要的样本越多
                    </p>
                </div>

                <NextButton onClick={onNext} />
            </div>
        );
    }

    // step === "summary"
    const n0Rounded = Math.ceil(n0);
    const n1 = Math.ceil(n0 / (1 + (n0 - 1) / params.populationSize));
    return (
        <div className="space-y-8">
            <StepHeader current={3} total={3} />

            <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-4">公式全貌</h2>
            </div>

            <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                <FormulaLine label="无限总体" formula={`n₀ = (${z}² × 0.5 × 0.5) / ${E}²`} result={n0Rounded} delay={0} />
                <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-3" />
                <FormulaLine
                    label="有限总体校正"
                    formula={`n₁ = ${n0Rounded} / (1 + ${n0Rounded - 1} / ${params.populationSize.toLocaleString()})`}
                    result={n1}
                    delay={400}
                />
            </div>

            <div className="text-center space-y-2 animate-in fade-in duration-500" style={{ animationDelay: "800ms", animationFillMode: "both" }}>
                <p className="text-gray-600 dark:text-slate-300 text-lg">
                    在无限大总体中需要 <strong className="text-indigo-500 tabular-nums">{n0Rounded}</strong> 人，
                    考虑你的总体只有 <strong className="tabular-nums">{params.populationSize.toLocaleString()}</strong> 人后，需要 <strong className="text-emerald-500 tabular-nums">{n1}</strong> 人。
                </p>
                <p className="text-gray-400 dark:text-slate-500 text-sm">
                    接下来看看"有限总体校正"的原理。
                </p>
            </div>

            <NextButton onClick={onNext} label="探索有限总体校正" />
        </div>
    );
}

// --- Sub-components ---

function StepHeader({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
                第 {current} 步 / 共 {total} 步
            </span>
        </div>
    );
}

function FormulaDisplay({ parts }: { parts: Array<{ text: string; dim?: boolean; highlight?: string }> }) {
    return (
        <div className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-center">
            {parts.map((p, i) => (
                <span
                    key={i}
                    className={
                        p.highlight === "indigo" ? "text-indigo-500"
                            : p.highlight === "teal" ? "text-teal-500"
                                : p.dim ? "text-slate-400 dark:text-slate-500"
                                    : "text-slate-700 dark:text-slate-200"
                    }
                >
                    {p.text}
                </span>
            ))}
        </div>
    );
}

function FormulaLine({ label, formula, result, delay }: { label: string; formula: string; result: number; delay: number }) {
    return (
        <div
            className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
        >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="font-mono text-sm text-slate-600 dark:text-slate-300 break-all">{formula}</p>
            <p className="text-right text-xl font-bold tabular-nums text-indigo-500">= {result.toLocaleString()}</p>
        </div>
    );
}

function ErrorRangeVisual({ margin }: { margin: number }) {
    const center = 50;
    const lo = center - margin;
    const hi = center + margin;
    // Map 0–100 value range to percentage of bar width
    const loP = lo;
    const hiP = hi;
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">误差范围可视化</p>
            <div className="relative h-6 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                    className="absolute top-0 bottom-0 bg-teal-400/40 dark:bg-teal-500/30 transition-all duration-300"
                    style={{ left: `${loP}%`, width: `${hiP - loP}%` }}
                />
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-500 dark:bg-slate-300"
                    style={{ left: "50%" }}
                />
            </div>
            <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                <span>{lo}%</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">真实值 {center}%</span>
                <span>{hi}%</span>
            </div>
        </div>
    );
}

function NextButton({ onClick, label = "继续" }: { onClick: () => void; label?: string }) {
    return (
        <div className="flex justify-center pt-2">
            <Button
                type="button"
                onClick={onClick}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
            >
                {label}
                <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
        </div>
    );
}
