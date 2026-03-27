import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import type { SampleParams } from "../types";
import { zForConfidenceLevel } from "../types";

interface Props {
    params: SampleParams;
    onNext: () => void;
}

const BASE_DEMO_SIZES = [30, 100, 300, 500, 1000];

function fmt(n: number, digits = 4): string {
    return n.toFixed(digits);
}

export function PrecisionPhase({ params, onNext }: Props) {
    const N = params.populationSize;
    const isMeanEstimation = params.estimationType === "mean";
    const sigma2 = params.populationVariance ?? 100;

    const demoSizes = useMemo(() => {
        const valid = BASE_DEMO_SIZES.filter(s => s <= N);
        if (valid.length > 0) return valid;
        const half = Math.max(1, Math.floor(N / 2));
        return half < N ? [half, N] : [N];
    }, [N]);

    const [demoN, setDemoN] = useState(() => {
        const valid = BASE_DEMO_SIZES.filter(s => s <= N);
        if (valid.length > 0) {
            return valid.includes(100) ? 100 : valid[valid.length - 1]!;
        }
        return Math.max(1, Math.floor(N / 2));
    });

    const z = zForConfidenceLevel(params.confidenceLevel);
    const fpc = Math.max(0, 1 - demoN / N);
    const se = isMeanEstimation
        ? Math.sqrt(sigma2 / demoN * fpc)
        : Math.sqrt(0.25 / demoN * fpc);
    const me = z * se;
    const cv = !isMeanEstimation ? se / 0.5 : null;

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-xs font-medium text-amber-700 dark:text-amber-300">
                    精度指标
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                    怎么衡量估计的精度？
                </h2>
                <p className="text-gray-500 dark:text-slate-400">
                    {isMeanEstimation
                        ? "均值估计主要看标准误差和误差限；若需要比较相对精度，可再计算相对标准误差。"
                        : "抽样估计有三个核心精度指标：标准误差、误差限和变异系数"}
                </p>
            </div>

            <div className={`grid gap-4 ${isMeanEstimation ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">标准误差 SE</p>
                    <p className="font-mono text-sm text-slate-700 dark:text-slate-200">
                        {isMeanEstimation ? "SE(ȳ) = √(σ²/n × FPC)" : "SE = √(p(1−p)/n × FPC)"}
                    </p>
                    <p className="text-xs text-slate-500">
                        估计值的标准差，衡量抽样随机波动的大小。SE 越小，估计越精确。
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">误差限 ME</p>
                    <p className="font-mono text-sm text-slate-700 dark:text-slate-200">
                        ME = Z × SE
                    </p>
                    <p className="text-xs text-slate-500">
                        {isMeanEstimation
                            ? "置信区间的半宽。如 ME=2，表示正式区间会写成 ȳ ± 2。"
                            : "置信区间的半宽。如 ME=3%，意为正式区间可写成 p̂ ± 3%。"}
                    </p>
                </div>
                {!isMeanEstimation && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">变异系数 CV</p>
                        <p className="font-mono text-sm text-slate-700 dark:text-slate-200">
                            CV = SE / <var>p̂</var>
                        </p>
                        <p className="text-xs text-slate-500">
                            相对精度。便于不同量纲的指标之间比较精度高低。CV &lt; 5% 通常被认为是高精度。
                        </p>
                    </div>
                )}
            </div>

            {/* Interactive demo */}
            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-center text-slate-600 dark:text-slate-300">
                        {isMeanEstimation ? "调整样本量，观察 SE 与 ME 的变化" : "调整样本量，观察三个指标的变化"}
                        <span className="text-xs text-slate-400 ml-2">
                            {isMeanEstimation
                                ? `(σ²=${sigma2}, N=${N.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : `(p=0.5, N=${N.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>

                <div className="p-4 space-y-4">
                    <div className="flex gap-2 flex-wrap justify-center" role="group" aria-label="选择样本量">
                        {demoSizes.map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setDemoN(n)}
                                aria-pressed={demoN === n}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    demoN === n
                                        ? "bg-indigo-500 text-white shadow-sm"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                                }`}
                            >
                                n={n}
                            </button>
                        ))}
                    </div>

                    <div className={`grid gap-3 text-center ${isMeanEstimation ? "grid-cols-2" : "grid-cols-3"}`}>
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-blue-400">SE</p>
                            <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{fmt(se)}</p>
                        </div>
                        <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-violet-400">ME</p>
                            <p className="text-lg font-bold tabular-nums text-violet-600 dark:text-violet-400">{fmt(me)}</p>
                        </div>
                        {!isMeanEstimation && cv != null && (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">CV</p>
                                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{(cv * 100).toFixed(1)}%</p>
                            </div>
                        )}
                    </div>
                    {isMeanEstimation && (
                        <p className="text-center text-xs text-slate-400">
                            若要比较不同量纲下的均值精度，可再结合实际均值计算 RSE = SE / |ȳ|。
                        </p>
                    )}
                </div>
            </div>

            {/* Confidence interval explanation */}
            <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">置信区间的含义</p>
                <p className="text-sm text-amber-700 dark:text-amber-400/80">
                    「{params.confidenceLevel}% 置信区间」的含义是：<strong>如果用相同方法重复抽样 100 次，大约有 {params.confidenceLevel} 次的区间会包含总体真值。</strong>
                    它不是说真值有 {params.confidenceLevel}% 的概率落在某一次的区间里——真值是固定的，是区间在变。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
                >
                    接下来：确定精度的考虑因素
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}
