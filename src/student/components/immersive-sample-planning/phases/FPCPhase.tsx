import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";
import {
    calculateFinitePopulationSampleSize,
    calculateMeanEstimationSampleSize,
    calculateSampleSizeStepDetails,
} from "../../../experiment/sample-plan";
import type { SampleParams } from "../types";

interface Props {
    params: SampleParams;
    onNext: () => void;
}

const DEMO_POPULATIONS = [500, 2_000, 10_000, 100_000];
const MAX_CUSTOM_POPULATION = 10_000_000;

export function FPCPhase({ params, onNext }: Props) {
    const [customN, setCustomN] = useState<string>("");

    const { n0Raw, n0, n2: fpcOnlyUserN } = calculateSampleSizeStepDetails({
        estimationType: params.estimationType,
        confidenceLevel: params.confidenceLevel,
        marginOfError: params.marginOfError,
        populationSize: params.populationSize,
        populationVariance: params.populationVariance,
        designEffect: 1,
        nonResponseRate: 0,
    });
    const n0RawDisplay = n0Raw.toFixed(2);

    /** 仅含 FPC，不含设计效应与无回答率，与「现实世界」步骤后的 recommendedSize 区分 */
    // Build comparison rows
    const populations = [...DEMO_POPULATIONS];
    if (!populations.includes(params.populationSize)) {
        populations.push(params.populationSize);
        populations.sort((a, b) => a - b);
    }
    const customNValue = Number.parseInt(customN.trim(), 10);
    const clampedCustomN =
        !Number.isNaN(customNValue) && customNValue > 0
            ? Math.min(customNValue, MAX_CUSTOM_POPULATION)
            : null;
    if (clampedCustomN != null && !populations.includes(clampedCustomN)) {
        populations.push(clampedCustomN);
        populations.sort((a, b) => a - b);
    }

    const rows = populations.map((N) => {
        const n1 = params.estimationType === "mean"
            ? calculateMeanEstimationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: N,
                populationVariance: params.populationVariance ?? 0,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? n0
            : calculateFinitePopulationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: N,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? n0;
        const ratio = ((n1 / N) * 100).toFixed(1);
        return { N, n1, ratio, isUser: N === params.populationSize };
    });

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-auxiliary-muted/50 text-xs font-medium text-auxiliary-strong">
                    有限总体校正
                </span>
                <h2 className="text-2xl font-bold text-foreground">
                    把公式修正到你的真实总体
                </h2>
                <p className="text-muted-foreground">
                    前一步得到的是无限总体下的初始样本量 n₀；这一步根据你的总体规模 N 做有限总体校正，得到更贴近真实调查的 n₂。
                </p>
            </div>

            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <div className="font-mono text-sm text-muted-foreground text-center">
                        n₂ = n<sub>deff</sub> × N / (N − 1 + n<sub>deff</sub>)　　n<sub>deff</sub> ≈ {n0RawDisplay}
                    </div>
                </div>

                <div className="divide-y divide-border">
                    {rows.map((row) => (
                        <div
                            key={row.N}
                            className={`flex items-center gap-4 px-4 py-3 ${
                                row.isUser
                                    ? "bg-primary/10"
                                    : ""
                            }`}
                        >
                            <div className="flex shrink-0 items-center justify-end gap-1.5 min-w-[8.5rem] text-right">
                                <span className={`text-sm tabular-nums whitespace-nowrap ${row.isUser ? "font-bold text-primary" : "text-muted-foreground"}`}>
                                    N = {row.N.toLocaleString()}
                                </span>
                                {row.isUser && (
                                    <span className="text-[10px] text-primary whitespace-nowrap">← 你的</span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="h-4 rounded-full bg-muted-foreground/50 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            row.isUser ? "bg-primary" : "bg-auxiliary"
                                        }`}
                                        style={{ width: `${Math.max(3, (row.n1 / Math.max(n0Raw, 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="w-20 text-right">
                                <span className="text-sm font-bold tabular-nums text-foreground/90">
                                    {row.n1.toLocaleString()}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">({row.ratio}%)</span>
                            </div>
                        </div>
                    ))}

                    {/* N → ∞ row */}
                    <div className="flex items-center gap-4 px-4 py-3 opacity-60">
                        <div className="flex shrink-0 items-center justify-end min-w-[8.5rem] text-right">
                            <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">N = ∞</span>
                        </div>
                        <div className="flex-1">
                            <div className="h-4 rounded-full bg-muted-foreground/50 overflow-hidden">
                                <div className="h-full rounded-full bg-muted-foreground/40 w-full" />
                            </div>
                        </div>
                        <div className="w-20 text-right">
                            <span className="text-sm font-bold tabular-nums text-muted-foreground">{n0RawDisplay}</span>
                        </div>
                    </div>
                </div>

                {/* Custom N input */}
                <div className="px-4 py-3 bg-card/50 border-t border-border flex items-center gap-2">
                    <label htmlFor="fpc-custom-population" className="text-xs text-muted-foreground whitespace-nowrap">试试其他 N：</label>
                    <Input
                        id="fpc-custom-population"
                        type="number"
                        placeholder="输入总体大小"
                        value={customN}
                        onChange={(e) => setCustomN(e.target.value)}
                        className="h-8 text-sm bg-background border-border"
                    />
                </div>
            </div>

            <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                    总体越小，有限总体校正减少的样本量越多。<br />
                    你的总体 {params.populationSize.toLocaleString()} 人 → 在仅考虑 FPC（不含设计效应与无回答率）时约需{" "}
                    <strong className="text-primary tabular-nums">{fpcOnlyUserN.toLocaleString()}</strong>
                    （无限总体计算值约为 {n0RawDisplay}，规划时取 {n0.toLocaleString()}）
                </p>
                <p className="text-xs text-muted-foreground">
                    这意味着：你现在已经得到可用于真实总体的基础样本量 n₂。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-xl shadow-lg shadow-primary/20"
                >
                    继续：汇总为最终样本量
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}
