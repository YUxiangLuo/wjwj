import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlanningHeading } from "./PlanningShared";
import { FourStepPhase } from "./phases/FourStepPhase";
import { PrecisionPhase } from "./phases/PrecisionPhase";
import { FactorsPhase } from "./phases/FactorsPhase";
import type { FactorsStep, SampleParams } from "./types";

const panels = [
    { id: "calculation", label: "推荐值怎么算" },
    { id: "precision", label: "样本量与精度" },
    { id: "factors", label: "影响因素" },
] as const;

/** Optional reference material; examples never mutate the selected plan. */
export function PlanningReference({ params }: { params: SampleParams }) {
    const [panel, setPanel] = useState<(typeof panels)[number]["id"]>("calculation");
    const [factor, setFactor] = useState<FactorsStep>("summary");
    return <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="规划参考内容">
            {panels.map(item => <Button key={item.id} type="button" variant={panel === item.id ? "default" : "outline"}
                aria-pressed={panel === item.id} onClick={() => setPanel(item.id)}>{item.label}</Button>)}
            <p className="ml-auto text-meta text-muted-foreground">按需查看，无需答题；示例试算不改动实际方案。</p>
        </div>
        {params.recommendedSize <= 0 ? <PlanningHeading title="先填写有效的规划参数" description="返回调整方案，填入正数误差限及有效的调查假设，即可查看对应的计算过程。"/>
            : panel === "calculation" ? <FourStepPhase params={params} estimationType={params.estimationType} populationVariance={params.populationVariance ?? 100}
                scenario="summary" hideNext onNext={() => {}} onDesignEffectChange={() => {}} onNonResponseRateChange={() => {}}/>
            : panel === "precision" ? <PrecisionPhase params={params} initialSampleSize={params.finalSampleSize} hideNext onNext={() => {}}/>
            : <FactorsPhase step={factor} params={params} onStepChange={setFactor} hideNext onNext={() => {}}/>}
    </div>;
}
