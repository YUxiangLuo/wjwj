import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";
import { calculateFinitePopulationSampleSize } from "../../../experiment/sample-plan";
import { type SampleParams } from "../types";

interface Props {
    params: SampleParams;
    onNext: () => void;
}

const DEMO_POPULATIONS = [500, 2_000, 10_000, 100_000];

function calcN0(z: number, e: number, p = 0.5): number {
    return Math.ceil((z * z * p * (1 - p)) / (e * e));
}

export function FPCPhase({ params, onNext }: Props) {
    const [customN, setCustomN] = useState<string>("");

    const z = ({ "90": 1.645, "95": 1.96, "99": 2.576 } as Record<string, number>)[params.confidenceLevel] ?? 1.96;
    const E = params.marginOfError / 100;
    const n0 = calcN0(z, E);

    // Build comparison rows
    const populations = [...DEMO_POPULATIONS];
    if (!populations.includes(params.populationSize)) {
        populations.push(params.populationSize);
        populations.sort((a, b) => a - b);
    }
    const customNValue = parseInt(customN);
    if (!Number.isNaN(customNValue) && customNValue > 0 && !populations.includes(customNValue)) {
        populations.push(customNValue);
        populations.sort((a, b) => a - b);
    }

    const rows = populations.map((N) => {
        const n1 = calculateFinitePopulationSampleSize({
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
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-950/50 text-xs font-medium text-violet-700 dark:text-violet-300">
                    有限总体校正
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                    你没有无限多的人
                </h2>
                <p className="text-gray-500 dark:text-slate-400">
                    总体越小，有限总体校正 (FPC) 的效果越明显
                </p>
            </div>

            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
                    <div className="font-mono text-sm text-slate-500 dark:text-slate-400 text-center">
                        n₁ = n₀ / (1 + (n₀ − 1) / <strong className="text-violet-500">N</strong>)　　n₀ = {n0}
                    </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row) => (
                        <div
                            key={row.N}
                            className={`flex items-center gap-4 px-4 py-3 ${
                                row.isUser
                                    ? "bg-indigo-50/50 dark:bg-indigo-950/20"
                                    : ""
                            }`}
                        >
                            <div className="flex shrink-0 items-center justify-end gap-1.5 min-w-[8.5rem] text-right">
                                <span className={`text-sm tabular-nums whitespace-nowrap ${row.isUser ? "font-bold text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-300"}`}>
                                    N = {row.N.toLocaleString()}
                                </span>
                                {row.isUser && (
                                    <span className="text-[10px] text-indigo-400 dark:text-indigo-500 whitespace-nowrap">← 你的</span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            row.isUser ? "bg-indigo-500" : "bg-violet-400 dark:bg-violet-600"
                                        }`}
                                        style={{ width: `${Math.max(3, (row.n1 / n0) * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="w-20 text-right">
                                <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                    {row.n1.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">({row.ratio}%)</span>
                            </div>
                        </div>
                    ))}

                    {/* N → ∞ row */}
                    <div className="flex items-center gap-4 px-4 py-3 opacity-60">
                        <div className="flex shrink-0 items-center justify-end min-w-[8.5rem] text-right">
                            <span className="text-sm tabular-nums text-slate-500 whitespace-nowrap">N = ∞</span>
                        </div>
                        <div className="flex-1">
                            <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                <div className="h-full rounded-full bg-slate-300 dark:bg-slate-500 w-full" />
                            </div>
                        </div>
                        <div className="w-20 text-right">
                            <span className="text-sm font-bold tabular-nums text-slate-500">{n0.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Custom N input */}
                <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">试试其他 N：</span>
                    <Input
                        type="number"
                        placeholder="输入总体大小"
                        value={customN}
                        onChange={(e) => setCustomN(e.target.value)}
                        className="h-8 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    />
                </div>
            </div>

            <div className="text-center space-y-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                    总体越小，校正减少的样本量越多。<br />
                    你的总体 {params.populationSize.toLocaleString()} 人 → 仅需 <strong className="text-indigo-500 tabular-nums">{params.recommendedSize}</strong>（而非 {n0}）
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
                >
                    接下来：现实世界的调整
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}
