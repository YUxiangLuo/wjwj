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
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning text-xs font-medium text-warning">
                    精度指标
                </span>
                <h2 className="text-2xl font-bold text-foreground">
                    怎么衡量估计的精度？
                </h2>
                <p className="text-muted-foreground">
                    {isMeanEstimation
                        ? "正式计算样本量之前，先认识后面会反复出现的精度指标。均值估计主要看标准误差和误差限；若需要比较相对精度，可再计算相对标准误差。"
                        : "正式计算样本量之前，先认识后面会反复出现的精度指标。它们决定你要求多“准”，也决定样本量会有多大。"}
                </p>
            </div>

            <div className={`grid gap-4 ${isMeanEstimation ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                <div className="rounded-2xl border border-border bg-background dark:bg-card p-4 shadow-sm space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">标准误差 SE</p>
                    <p className="font-mono text-sm text-foreground/90">
                        {isMeanEstimation ? "SE(ȳ) = √(σ²/n × FPC)" : "SE = √(p(1−p)/n × FPC)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        估计值的标准差，衡量抽样随机波动的大小。SE 越小，估计越精确。
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-background dark:bg-card p-4 shadow-sm space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">误差限 ME</p>
                    <p className="font-mono text-sm text-foreground/90">
                        ME = Z × SE
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {isMeanEstimation
                            ? "置信区间的半宽。如 ME=2，表示正式区间会写成 ȳ ± 2。"
                            : "置信区间的半宽。如 ME=3%，意为正式区间可写成 p̂ ± 3%。"}
                    </p>
                </div>
                {!isMeanEstimation && (
                    <div className="rounded-2xl border border-border bg-background dark:bg-card p-4 shadow-sm space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">变异系数 CV</p>
                        <p className="font-mono text-sm text-foreground/90">
                            CV = SE / <var>p̂</var>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            相对精度。便于不同量纲的指标之间比较精度高低。CV &lt; 5% 通常被认为是高精度。
                        </p>
                    </div>
                )}
            </div>

            {/* Interactive demo */}
            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background dark:bg-card shadow-sm overflow-hidden">
                <div className="bg-card dark:bg-muted/50 px-4 py-2.5 border-b border-border dark:border-input">
                    <p className="text-sm text-center text-muted-foreground">
                        {isMeanEstimation ? "先直观看一眼：样本量变化时，SE 与 ME 怎么变" : "先直观看一眼：样本量变化时，三个精度指标怎么变"}
                        <span className="text-xs text-muted-foreground ml-2">
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
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/50"
                                }`}
                            >
                                n={n}
                            </button>
                        ))}
                    </div>

                    <div className={`grid gap-3 text-center ${isMeanEstimation ? "grid-cols-2" : "grid-cols-3"}`}>
                        <div className="rounded-xl bg-info p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-info">SE</p>
                            <p className="text-lg font-bold tabular-nums text-info">{fmt(se)}</p>
                        </div>
                        <div className="rounded-xl bg-auxiliary-muted/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-auxiliary">ME</p>
                            <p className="text-lg font-bold tabular-nums text-auxiliary">{fmt(me)}</p>
                        </div>
                        {!isMeanEstimation && cv != null && (
                            <div className="rounded-xl bg-success p-3">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-success">CV</p>
                                <p className="text-lg font-bold tabular-nums text-success">{(cv * 100).toFixed(1)}%</p>
                            </div>
                        )}
                    </div>
                    {isMeanEstimation && (
                        <p className="text-center text-xs text-muted-foreground">
                            若要比较不同量纲下的均值精度，可再结合实际均值计算 RSE = SE / |ȳ|。
                        </p>
                    )}
                </div>
            </div>

            {/* Confidence interval explanation */}
            <div className="mx-auto max-w-lg rounded-2xl border border-warning bg-warning/50 p-5 space-y-2">
                <p className="text-sm font-semibold text-warning">置信区间的含义</p>
                <p className="text-sm text-warning">
                    「{params.confidenceLevel}% 置信区间」的含义是：<strong>如果用相同方法重复抽样 100 次，大约有 {params.confidenceLevel} 次的区间会包含总体真值。</strong>
                    它不是说真值有 {params.confidenceLevel}% 的概率落在某一次的区间里——真值是固定的，是区间在变。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-primary hover:bg-primary text-primary-foreground px-8 py-5 rounded-xl shadow-lg shadow-primary/20"
                >
                    继续：判断哪些条件会影响样本量
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}
