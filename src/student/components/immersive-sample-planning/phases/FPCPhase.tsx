import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    calculateFinitePopulationSampleSize,
    calculateMeanEstimationSampleSize,
    calculateSampleSizeStepDetails,
} from "../../../experiment/sample-plan";
import type { SampleParams } from "../types";
import { PhaseNextButton } from "./shared";

interface Props {
    params: SampleParams;
    onNext: () => void;
}

const DEMO_POPULATIONS = [500, 2_000, 10_000, 100_000];
const MAX_CUSTOM_POPULATION = 10_000_000;

export function FPCPhase({ params, onNext }: Props) {
    const [customN, setCustomN] = useState<string>("");

    const { n0Raw, n0, n1: fpcOnlyUserN } = calculateSampleSizeStepDetails({
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
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3 text-center">
                <span className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    有限总体校正
                </span>
                <h2 className="text-2xl font-bold text-foreground">
                    把公式修正到你的真实总体
                </h2>
                <p className="text-muted-foreground">
                    前一步得到的是无限总体下的初始样本量 n₀；这一步根据你的总体规模 N 做有限总体校正，得到更贴近真实调查的 n₁。
                </p>
            </div>

            <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
                <div className="border-b bg-muted/50 px-4 py-2.5">
                    <div className="text-center font-mono text-sm text-muted-foreground">
                        n₁ = n₀ / (1 + (n₀ − 1) / <strong className="text-primary">N</strong>)　　n₀ ≈ {n0RawDisplay}
                    </div>
                </div>

                <div className="divide-y">
                    {rows.map((row) => (
                        <div
                            key={row.N}
                            className={cn("flex items-center gap-4 px-4 py-3", row.isUser && "bg-primary/10")}
                        >
                            <div className="flex shrink-0 items-center justify-end gap-1.5 min-w-[8.5rem] text-right">
                                <span className={cn("whitespace-nowrap text-sm tabular-nums", row.isUser ? "font-bold text-primary" : "text-foreground")}>
                                    N = {row.N.toLocaleString()}
                                </span>
                                {row.isUser && (
                                    <span className="whitespace-nowrap text-[10px] text-primary/80">← 你的</span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="h-4 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-500", row.isUser ? "bg-primary" : "bg-warning")}
                                        style={{ width: `${Math.max(3, (row.n1 / Math.max(n0Raw, 1)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="w-20 text-right">
                                <span className="text-sm font-bold tabular-nums text-foreground">
                                    {row.n1.toLocaleString()}
                                </span>
                                <span className="ml-1 text-xs text-muted-foreground">({row.ratio}%)</span>
                            </div>
                        </div>
                    ))}

                    <div className="flex items-center gap-4 px-4 py-3 opacity-60">
                        <div className="flex shrink-0 items-center justify-end min-w-[8.5rem] text-right">
                            <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">N = ∞</span>
                        </div>
                        <div className="flex-1">
                            <div className="h-4 overflow-hidden rounded-full bg-muted">
                                <div className="h-full w-full rounded-full bg-muted-foreground/40" />
                            </div>
                        </div>
                        <div className="w-20 text-right">
                            <span className="text-sm font-bold tabular-nums text-muted-foreground">{n0RawDisplay}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-t bg-muted/50 px-4 py-3">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">试试其他 N：</span>
                    <Input
                        type="number"
                        placeholder="输入总体大小"
                        value={customN}
                        onChange={(e) => setCustomN(e.target.value)}
                        className="h-8 text-sm"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2 text-center">
                <p className="text-sm text-muted-foreground">
                    总体越小，有限总体校正减少的样本量越多。<br />
                    你的总体 {params.populationSize.toLocaleString()} 人 → 在仅考虑 FPC（不含设计效应与无回答率）时约需{" "}
                    <strong className="tabular-nums text-primary">{fpcOnlyUserN.toLocaleString()}</strong>
                    （无限总体计算值约为 {n0RawDisplay}，规划时取 {n0.toLocaleString()}）
                </p>
                <p className="text-xs text-muted-foreground">
                    这意味着：你现在已经得到可用于真实总体的基础样本量 n₁。
                </p>
            </div>

            <PhaseNextButton onClick={onNext} label="继续：汇总为最终样本量" />
        </div>
    );
}
