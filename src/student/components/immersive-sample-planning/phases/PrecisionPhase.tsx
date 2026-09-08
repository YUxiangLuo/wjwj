import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowRight } from "lucide-react";
import { formatStatistic } from "@/utils/statistic-format";
import { calculatePlannedPrecision } from "../../../experiment/planned-precision";
import { PlanningAssumptions, PlanningHeading, PlanningOutcome } from "../PlanningShared";
import { primarySliderClassName } from "../../sample-planning-styles";
import type { SampleParams } from "../types";

interface Props {
    params: SampleParams;
    onNext: () => void;
    initialSampleSize?: number | null;
    hideNext?: boolean;
}

export function PrecisionPhase({ params, onNext, initialSampleSize, hideNext = false }: Props) {
    const N = params.populationSize;
    const initial = initialSampleSize ?? params.recommendedSize;
    const [demoN, setDemoN] = useState(Math.max(1, Math.min(N, initial)));
    const precision = calculatePlannedPrecision(params, demoN);
    const choices = [...new Set([initialSampleSize, Math.max(1, Math.floor(N / 4)), Math.max(1, Math.floor(N / 2)), params.recommendedSize, N]
        .filter((n): n is number => n != null && n >= 1 && n <= N))].sort((a,b) => a-b);
    const isMean = params.estimationType === "mean";
    return <div className="space-y-6">
        <PlanningHeading title="样本多一点，误差会小多少？" description="拖动样本量，观察它与目标精度的关系。这里的试算不会改动你的最终方案。"/>
        <section className="rounded-surface border border-border bg-card p-6 space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-subheading font-semibold">试算邀请样本量</h3>
                <p className="text-section-title font-bold tabular-nums text-primary">{demoN} <span className="text-body font-normal text-muted-foreground">/ {N.toLocaleString()} 个单位</span></p>
            </div>
            <Slider aria-label="试算样本量" min={1} max={N} step={1} value={[demoN]} onValueChange={([n]) => n != null && setDemoN(n)} className={primarySliderClassName}/>
            <div className="flex flex-wrap gap-2" role="group" aria-label="选择样本量">
                {choices.map(n => <Button key={n} type="button" variant={demoN === n ? "default" : "outline"} aria-pressed={demoN === n} onClick={() => setDemoN(n)}>
                    {n}{n === params.recommendedSize ? " · 建议" : n === N ? " · 全体" : n === initialSampleSize ? " · 你的估计" : " 个"}
                </Button>)}
            </div>
            <PlanningOutcome params={{...params, advancedPlanSource: undefined}} sampleSize={demoN}/>
            {precision && <p className="text-meta text-muted-foreground">标准误差 SE = <span className="tabular-nums">{formatStatistic(precision.standardError)}</span>；误差限 ME = Z × SE{!isMean && <>；相对标准误差 CV = SE / p = {(precision.standardError / 0.5 * 100).toFixed(2)}%</>}。</p>}
        </section>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
            <section className="rounded-surface border border-border bg-card p-5 space-y-3">
                <h3 className="text-subheading font-semibold">先看误差限，再看样本量</h3>
                <p className="text-body text-muted-foreground">误差限是区间的半宽。{isMean ? "例如均值估计的误差限为 2，区间写作 ȳ ± 2，单位与研究指标一致。" : "例如估计比例为 50%，误差限为 5 个百分点，对应 45%～55%。它不是估计值的 5%。"}</p>
                <p className="text-label text-muted-foreground">样本增加时，抽样误差通常会减小。总体较小且要求很精确时，需要调查很大一部分单位。</p>
            </section>
            <section className="rounded-surface border border-border bg-card p-5 space-y-3">
                <h3 className="text-subheading font-semibold">{params.confidenceLevel}% 置信是什么意思？</h3>
                <p className="text-body text-muted-foreground">如果重复抽样并构造区间，长期来看，大约 {params.confidenceLevel}% 的区间会覆盖总体真值。</p>
                <p className="text-label text-muted-foreground">真值是固定的，区间随样本变化。这是近似规划，不能保证每次估计的误差都落在目标以内。</p>
            </section>
        </div>
        <details className="rounded-surface border border-border bg-card p-5">
            <summary className="cursor-pointer text-label font-semibold text-foreground">查看 SE、ME 与 CV 的公式和假设</summary>
            <div className="mt-4 space-y-3 text-label text-muted-foreground">
                <p className="font-mono break-words">{isMean ? "SE(ȳ) = √[deff × σ²/n × (N−n)/(N−1)]" : "SE = √[deff × p(1−p)/n × (N−n)/(N−1)]"}</p>
                <p>ME = Z × SE；这里的 n 是预期完成量，有限总体方差采用分母 N 的定义。SE 是估计值的标准差。</p>
                <p>{isMean ? "结合非零均值，可计算相对标准误差 RSE = SE / |均值|。" : "CV = SE / p；规划时使用假设比例 p = 0.5。接近零的比例会使相对标准误差不稳定，没有通用合格阈值。"}</p>
                <PlanningAssumptions params={params}/>
            </div>
        </details>
        {!hideNext && <Button onClick={onNext}>继续：了解影响因素<ArrowRight className="ml-2 h-4 w-4"/></Button>}
    </div>;
}
