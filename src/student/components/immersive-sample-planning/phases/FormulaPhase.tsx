import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";
import { Z_VALUES, type FormulaStep, type SampleParams } from "../types";
import { PhaseNextButton as NextButton } from "./shared";

export type EstimationType = "proportion" | "mean";

interface Props {
    step: FormulaStep;
    params: SampleParams;
    estimationType: EstimationType;
    populationVariance: number;
    onEstimationTypeChange: (v: EstimationType) => void;
    onPopulationVarianceChange: (v: number) => void;
    onConfidenceLevelChange: (v: string) => void;
    onMarginOfErrorChange: (v: number) => void;
    onNext: () => void;
}

function n0Proportion(z: number, e: number, p = 0.5): number {
    return (z * z * p * (1 - p)) / (e * e);
}

function n0Mean(z: number, e: number, sigma2: number): number {
    return (z * z * sigma2) / (e * e);
}

export function FormulaPhase({
    step, params,
    estimationType, populationVariance,
    onEstimationTypeChange, onPopulationVarianceChange,
    onConfidenceLevelChange, onMarginOfErrorChange,
    onNext,
}: Props) {
    const z = Z_VALUES[params.confidenceLevel] ?? 1.96;
    const isProportion = estimationType === "proportion";

    const E_proportion = params.marginOfError / 100;
    const E_mean = params.marginOfError; // absolute value for mean

    const n0 = isProportion
        ? n0Proportion(z, E_proportion)
        : n0Mean(z, E_mean, populationVariance);

    if (step === "z") {
        return (
            <div className="space-y-8">
                <StepHeader current={1} total={3} />

                {/* Estimation type toggle */}
                <div className="flex justify-center">
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-1">
                        <button
                            type="button"
                            onClick={() => onEstimationTypeChange("proportion")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isProportion
                                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                            比例估计
                        </button>
                        <button
                            type="button"
                            onClick={() => onEstimationTypeChange("mean")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                !isProportion
                                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                            均值估计
                        </button>
                    </div>
                </div>

                <div className="text-center space-y-2">
                    {isProportion ? (
                        <FormulaDisplay
                            parts={[
                                { text: "n₀ = ( ", dim: true },
                                { text: "Z²", highlight: "indigo" },
                                { text: " × p(1−p) ) / E²", dim: true },
                            ]}
                        />
                    ) : (
                        <FormulaDisplay
                            parts={[
                                { text: "n₀ = ( ", dim: true },
                                { text: "Z²", highlight: "indigo" },
                                { text: " × σ² ) / e²", dim: true },
                            ]}
                        />
                    )}
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
                            {Number.isFinite(n0) ? Math.ceil(n0).toLocaleString() : "—"}
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
                    {isProportion ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <FormulaDisplay
                                parts={[
                                    { text: `n₀ = ( ${z}² × `, dim: true },
                                    { text: "σ²", highlight: "violet" },
                                    { text: " ) / ", dim: true },
                                    { text: "e²", highlight: "teal" },
                                ]}
                            />
                            <p className="text-gray-500 dark:text-slate-400 mt-4 text-lg">
                                设置总体方差和误差限
                            </p>
                            <p className="text-gray-400 dark:text-slate-500 text-sm">
                                σ² 通常来自历史数据或预调查；e 是允许的绝对误差
                            </p>
                        </>
                    )}
                </div>

                <div className="max-w-sm mx-auto space-y-4">
                    {!isProportion && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">总体方差 σ²</label>
                            <Input
                                type="number"
                                min={0.01}
                                step={0.1}
                                value={populationVariance || ""}
                                onChange={(e) => {
                                    const v = Number.parseFloat(e.target.value);
                                    if (Number.isFinite(v) && v > 0) onPopulationVarianceChange(v);
                                }}
                                placeholder="例如 100"
                                className="h-12 text-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                            />
                            <p className="text-xs text-slate-400">可从历史调查数据中估算，或使用预调查结果</p>
                        </div>
                    )}

                    {isProportion ? (
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
                    ) : (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">绝对误差限 e</label>
                            <Input
                                type="number"
                                min={0.01}
                                step={0.1}
                                value={params.marginOfError || ""}
                                onChange={(e) => {
                                    const v = Number.parseFloat(e.target.value);
                                    if (Number.isFinite(v) && v > 0) onMarginOfErrorChange(v);
                                }}
                                placeholder="例如 2"
                                className="h-12 text-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                            />
                            <p className="text-xs text-slate-400">与均值同单位的绝对误差</p>
                        </div>
                    )}

                    {isProportion && <ErrorRangeVisual margin={params.marginOfError} />}

                    <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/30 p-4 text-center">
                        <p className="text-sm text-teal-600 dark:text-teal-300 mb-1">
                            {isProportion
                                ? `E = ${params.marginOfError}%　→　当前 n₀ =`
                                : `σ²=${populationVariance}, e=${params.marginOfError}　→　n₀ =`
                            }
                        </p>
                        <p className="text-3xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
                            {Number.isFinite(n0) && n0 > 0 ? Math.ceil(n0).toLocaleString() : "—"}
                        </p>
                    </div>

                    <p className="text-sm text-gray-400 dark:text-slate-500 text-center">
                        {isProportion ? "误差越小，需要的样本越多" : "方差越大或误差限越小，需要的样本越多"}
                    </p>
                </div>

                <NextButton onClick={onNext} />
            </div>
        );
    }

    // step === "summary"
    const n0Rounded = Number.isFinite(n0) ? Math.ceil(n0) : 0;
    const n1 = n0Rounded > 0
        ? Math.ceil(n0 / (1 + (n0 - 1) / params.populationSize))
        : 0;

    return (
        <div className="space-y-8">
            <StepHeader current={3} total={3} />

            <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">公式全貌</h2>
                <p className="text-sm text-slate-400">
                    {isProportion ? "比例估计" : "均值估计"}
                </p>
            </div>

            <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                {isProportion ? (
                    <FormulaLine
                        label="无限总体"
                        formula={`n₀ = (${z}² × 0.5 × 0.5) / ${E_proportion}²`}
                        result={n0Rounded}
                        delay={0}
                    />
                ) : (
                    <FormulaLine
                        label="无限总体"
                        formula={`n₀ = (${z}² × ${populationVariance}) / ${E_mean}²`}
                        result={n0Rounded}
                        delay={0}
                    />
                )}
                <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-3" />
                <FormulaLine
                    label="有限总体校正"
                    formula={`n₁ = ${n0Rounded} / (1 + ${Math.max(n0Rounded - 1, 0)} / ${params.populationSize.toLocaleString()})`}
                    result={n1}
                    delay={400}
                />
            </div>

            {/* Dual-formula comparison card */}
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-5 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">两种估计公式对比</p>
                <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 text-center ${isProportion ? "bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-300 dark:ring-indigo-700" : "bg-white dark:bg-slate-900"}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1">比例估计</p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">n₀ = Z²p(1−p)/E²</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${!isProportion ? "bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-300 dark:ring-indigo-700" : "bg-white dark:bg-slate-900"}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1">均值估计</p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300">n₀ = Z²σ²/e²</p>
                    </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    核心区别：比例估计的变异度用 p(1−p)，均值估计用总体方差 σ²
                </p>
            </div>

            <div className="text-center space-y-2 animate-in fade-in duration-500" style={{ animationDelay: "800ms", animationFillMode: "both" }}>
                <p className="text-gray-600 dark:text-slate-300 text-lg">
                    在无限大总体中需要 <strong className="text-indigo-500 tabular-nums">{n0Rounded.toLocaleString()}</strong> 人，
                    考虑你的总体只有 <strong className="tabular-nums">{params.populationSize.toLocaleString()}</strong> 人后，需要 <strong className="text-emerald-500 tabular-nums">{n1.toLocaleString()}</strong> 人。
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
                                : p.highlight === "violet" ? "text-violet-500"
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

