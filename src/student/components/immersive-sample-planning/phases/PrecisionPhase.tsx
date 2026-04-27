import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    const metricCardClass = "flex flex-col gap-2 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm";

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3 text-center">
                <span className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
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

            <div className={cn("grid gap-4", isMeanEstimation ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                <div className={metricCardClass}>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">标准误差 SE</p>
                    <p className="font-mono text-sm text-foreground">
                        {isMeanEstimation ? "SE(ȳ) = √(σ²/n × FPC)" : "SE = √(p(1−p)/n × FPC)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        估计值的标准差，衡量抽样随机波动的大小。SE 越小，估计越精确。
                    </p>
                </div>
                <div className={metricCardClass}>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">误差限 ME</p>
                    <p className="font-mono text-sm text-foreground">
                        ME = Z × SE
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {isMeanEstimation
                            ? "置信区间的半宽。如 ME=2，表示正式区间会写成 ȳ ± 2。"
                            : "置信区间的半宽。如 ME=3%，意为正式区间可写成 p̂ ± 3%。"}
                    </p>
                </div>
                {!isMeanEstimation && (
                    <div className={metricCardClass}>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">变异系数 CV</p>
                        <p className="font-mono text-sm text-foreground">
                            CV = SE / <var>p̂</var>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            相对精度。便于不同量纲的指标之间比较精度高低。CV &lt; 5% 通常被认为是高精度。
                        </p>
                    </div>
                )}
            </div>

            {/* Interactive demo */}
            <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
                <div className="border-b bg-muted/50 px-4 py-2.5">
                    <p className="text-center text-sm text-foreground">
                        {isMeanEstimation ? "先直观看一眼：样本量变化时，SE 与 ME 怎么变" : "先直观看一眼：样本量变化时，三个精度指标怎么变"}
                        <span className="ml-2 text-xs text-muted-foreground">
                            {isMeanEstimation
                                ? `(σ²=${sigma2}, N=${N.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : `(p=0.5, N=${N.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>

                <div className="flex flex-col gap-4 p-4">
                    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="选择样本量">
                        {demoSizes.map((n) => (
                            <Button
                                key={n}
                                type="button"
                                variant={demoN === n ? "default" : "outline"}
                                size="xs"
                                onClick={() => setDemoN(n)}
                                aria-pressed={demoN === n}
                                className="rounded-lg"
                            >
                                n={n}
                            </Button>
                        ))}
                    </div>

                    <div className={cn("grid gap-3 text-center", isMeanEstimation ? "grid-cols-2" : "grid-cols-3")}>
                        <div className="rounded-xl bg-chart-2/10 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-chart-2">SE</p>
                            <p className="text-lg font-bold tabular-nums text-chart-2">{fmt(se)}</p>
                        </div>
                        <div className="rounded-xl bg-chart-4/10 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-chart-4">ME</p>
                            <p className="text-lg font-bold tabular-nums text-chart-4">{fmt(me)}</p>
                        </div>
                        {!isMeanEstimation && cv != null && (
                            <div className="rounded-xl bg-chart-3/10 p-3">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-chart-3">CV</p>
                                <p className="text-lg font-bold tabular-nums text-chart-3">{(cv * 100).toFixed(1)}%</p>
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
            <div className="mx-auto flex max-w-lg flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/10 p-5">
                <p className="text-sm font-semibold text-primary">置信区间的含义</p>
                <p className="text-sm text-foreground">
                    「{params.confidenceLevel}% 置信区间」的含义是：<strong>如果用相同方法重复抽样 100 次，大约有 {params.confidenceLevel} 次的区间会包含总体真值。</strong>
                    它不是说真值有 {params.confidenceLevel}% 的概率落在某一次的区间里——真值是固定的，是区间在变。
                </p>
            </div>

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    size="lg"
                    className="rounded-xl px-8 shadow-lg shadow-primary/20"
                >
                    继续：判断哪些条件会影响样本量
                    <ChevronRight data-icon="inline-end" />
                </Button>
            </div>
        </div>
    );
}
