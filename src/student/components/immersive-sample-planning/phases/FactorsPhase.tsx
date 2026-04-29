import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight, Crosshair, Layers, BarChart3, DollarSign, CheckCircle2 } from "lucide-react";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../../experiment/sample-plan";
import type { SampleParams } from "../types";
import type { FactorsStep } from "../types";

interface Props {
    step: FactorsStep;
    params: SampleParams;
    onNext: () => void;
}

const STEP_META: Record<FactorsStep, { label: string; badge: string; icon: typeof Crosshair; intro: string }> = {
    error_tolerance: {
        label: "允许多大的误差",
        badge: "因素 1",
        icon: Crosshair,
        intro: "先判断你希望估计多精确。误差限是最直接影响样本量大小的因素。",
    },
    subpopulation: {
        label: "子总体估计需求",
        badge: "因素 2",
        icon: Layers,
        intro: "再判断是否需要对子总体单独达标。若每个子总体都要分别估计，总样本量往往会明显增加。",
    },
    variability: {
        label: "总体的变异程度",
        badge: "因素 3",
        icon: BarChart3,
        intro: "接着判断总体本身有多分散。总体越不稳定，越需要更多样本去把波动压下来。",
    },
    cost_balance: {
        label: "精度与费用的平衡",
        badge: "因素 4",
        icon: DollarSign,
        intro: "最后把统计精度和调查成本放在一起看，找到既合理又可执行的样本量。",
    },
    summary: {
        label: "四因素汇总",
        badge: "汇总",
        icon: CheckCircle2,
        intro: "四类关键条件已经看完。下一步把它们带入公式，正式计算样本量。",
    },
};

function formatAbsoluteErrorValue(value: number): string {
    return Number(value.toFixed(1)).toString();
}

function buildMeanErrorChoices(current: number) {
    const base = [0.5, 1, 2, 3, 5, 8];
    if (current > 0) base.push(current);
    return [...new Set(base)].sort((a, b) => a - b);
}

const panelClass = "student-card-shell mx-auto max-w-lg overflow-hidden";
const panelHeaderClass = "border-b bg-muted/50 px-4 py-2.5";
const sectionTextClass = "text-center text-sm text-muted-foreground";
const calloutClass = "student-callout student-callout-info mx-auto max-w-lg p-4";

export function FactorsPhase({ step, params, onNext }: Props) {
    const meta = STEP_META[step];
    const Icon = meta.icon;

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3 text-center">
                <span className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Icon className="size-3.5" />
                    {meta.badge}
                </span>
                <h2 className="text-2xl font-bold text-foreground">{meta.label}</h2>
                <p className="mx-auto max-w-2xl text-sm text-muted-foreground">{meta.intro}</p>
            </div>

            {step === "error_tolerance" && <ErrorToleranceContent params={params} />}
            {step === "subpopulation" && <SubpopulationContent params={params} />}
            {step === "variability" && <VariabilityContent />}
            {step === "cost_balance" && <CostBalanceContent params={params} />}
            {step === "summary" && <SummaryContent />}

            <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    size="lg"
                    className="rounded-xl px-8 shadow-lg shadow-primary/20"
                >
                    {step === "summary" ? "继续：进入样本量公式" : "继续：看下一个因素"}
                    <ChevronRight data-icon="inline-end" />
                </Button>
            </div>
        </div>
    );
}

/* ---- Sub-step content components ---- */

function ErrorToleranceContent({ params }: { params: SampleParams }) {
    const isMeanEstimation = params.estimationType === "mean";
    const sigma2 = params.populationVariance ?? 100;
    const [demoError, setDemoError] = useState(params.marginOfError);
    const demoN = isMeanEstimation
        ? calculateMeanEstimationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: demoError,
            populationSize: params.populationSize,
            populationVariance: sigma2,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0
        : calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: demoError,
            populationSize: params.populationSize,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0;

    const errors = isMeanEstimation ? buildMeanErrorChoices(params.marginOfError) : [1, 2, 3, 5, 7, 10];

    return (
        <div className="flex flex-col gap-6">
            <p className={sectionTextClass}>
                {isMeanEstimation ? (
                    <>
                        绝对误差限 <strong className="text-foreground">e</strong> 越小，对均值估计的精度要求越高，
                        所需样本量按 <strong className="text-foreground">1/e²</strong> 增长。
                    </>
                ) : (
                    <>
                        误差限越小，对精度的要求越高，所需样本量呈<strong className="text-foreground">非线性增长</strong>。
                        通常需要在可接受的误差和可承受的成本之间取得平衡。
                    </>
                )}
            </p>

            <div className={panelClass}>
                <div className={panelHeaderClass}>
                    <p className="text-center text-sm text-muted-foreground">
                        {isMeanEstimation ? "不同绝对误差限下的样本量" : "不同误差限下的样本量"}
                        <span className="text-xs">
                            {isMeanEstimation
                                ? ` (σ²=${sigma2}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="选择误差限">
                        {errors.map((e) => (
                            <Button
                                key={e}
                                type="button"
                                onClick={() => setDemoError(e)}
                                variant={demoError === e ? "default" : "outline"}
                                size="xs"
                                aria-pressed={demoError === e}
                                className="rounded-lg"
                            >
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(e)}` : `±${e}%`}
                            </Button>
                        ))}
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">所需样本量</p>
                        <p className="text-3xl font-black tabular-nums text-primary">
                            {demoN.toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            <div className={calloutClass}>
                <p className="text-sm text-foreground">
                    {isMeanEstimation ? (
                        <>
                            <strong>关键洞察：</strong>把绝对误差限减半，样本量大约增加 4 倍。
                            教学中常先用历史数据或预调查估计 σ²，再根据业务能接受的绝对误差来定样本量。
                        </>
                    ) : (
                        <>
                            <strong>关键洞察：</strong>将误差限从 5% 缩小到 1%，样本量会增加约 25 倍！
                            在实际项目中，±3%~5% 是最常见的精度要求。
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}

function SubpopulationContent({ params }: { params: SampleParams }) {
    const isMeanEstimation = params.estimationType === "mean";
    const sigma2 = params.populationVariance ?? 100;
    const nOverall = isMeanEstimation
        ? calculateMeanEstimationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: params.marginOfError,
            populationSize: params.populationSize,
            populationVariance: sigma2,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0
        : calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: 5,
            populationSize: params.populationSize,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0;

    const DOMAINS = [
        { name: "18-30岁", share: 0.25 },
        { name: "31-50岁", share: 0.40 },
        { name: "51岁以上", share: 0.35 },
    ];

    const domainSizes = DOMAINS.map((d) => {
        const domainN = Math.ceil(d.share * params.populationSize);
        const domainSample = isMeanEstimation
            ? calculateMeanEstimationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: domainN,
                populationVariance: sigma2,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? 0
            : calculateFinitePopulationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: 5,
                populationSize: domainN,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? 0;
        return { ...d, domainN, domainSample };
    });

    const totalDomainSample = domainSizes.reduce((s, d) => s + d.domainSample, 0);

    return (
        <div className="flex flex-col gap-6">
            <p className={sectionTextClass}>
                如果需要分别估计各<strong className="text-foreground">子总体</strong>（域）的参数，
                每个域都需要足够的样本量来保证精度。这里的示例把子总体视为<strong className="text-foreground">互不重叠的年龄层</strong>，
                因此总样本量按各层样本量求和，会显著高于仅做整体估计的需求。
                {isMeanEstimation && ` 这里为便于比较，暂假定各层方差近似相同，统一使用 σ²=${sigma2}。`}
            </p>

            <div className={panelClass}>
                <div className={panelHeaderClass}>
                    <p className="text-center text-sm text-muted-foreground">
                        {isMeanEstimation
                            ? `方案对比示例：按互斥年龄层分别估计均值 (±${formatAbsoluteErrorValue(params.marginOfError)}, σ²=${sigma2}, ${params.confidenceLevel}% CI)`
                            : `方案对比示例：按互斥年龄层分别估计 (±5%, ${params.confidenceLevel}% CI)`}
                    </p>
                </div>
                <div className="divide-y divide-border">
                    <div className="flex items-center justify-between bg-info/10 px-4 py-3">
                        <span className="text-sm font-medium text-info">方案1: 仅做整体估计</span>
                        <span className="text-sm font-bold tabular-nums text-info">n = {nOverall.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-destructive">方案2: 各子总体分别估计</span>
                            <span className="text-sm font-bold tabular-nums text-destructive">n ≈ {totalDomainSample.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col gap-1 pl-3">
                            {domainSizes.map((d) => (
                                <div key={d.name} className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{d.name} (N={d.domainN.toLocaleString()})</span>
                                    <span className="tabular-nums">{d.domainSample.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {totalDomainSample > nOverall && nOverall > 0 && (
                <div className={calloutClass}>
                    <p className="text-sm text-foreground">
                        <strong>方案2 约为方案1 的 {(totalDomainSample / nOverall).toFixed(1)} 倍！</strong>
                        子总体估计的样本量代价很大。在规划前，需先确认哪些域必须单独估计。
                    </p>
                </div>
            )}
        </div>
    );
}

function VariabilityContent() {
    return (
        <div className="flex flex-col gap-6">
            <p className={sectionTextClass}>
                这一步是在判断公式里的“变异度”该怎么理解。变异越大，需要的样本越多。
            </p>

            <div className="mx-auto flex max-w-lg flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-foreground">比例估计中的变异</p>
                        <p className="text-sm text-muted-foreground">
                            p(1−p) 在 p=0.5 时取最大值 0.25（最大方差）。
                            当比例越接近 0 或 1 时，方差越小，所需样本量越少。
                            <strong> 不确定 p 时，取 p=0.5 是最保守的选择。</strong>
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-foreground">均值估计中的变异</p>
                        <p className="text-sm text-muted-foreground">
                            需要总体方差 σ² 的先验估计。常用的获取途径：
                        </p>
                        <ul className="flex list-inside list-disc flex-col gap-1 pl-2 text-sm text-muted-foreground">
                            <li>历史调查数据</li>
                            <li>小规模预调查（pilot survey）</li>
                            <li>相似总体的经验值</li>
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
                    <p className="text-sm font-semibold text-foreground">多指标时的变异处理</p>
                    <p className="text-sm text-muted-foreground">
                        调查通常涉及多个指标，各指标的方差不同。原则上：
                    </p>
                    <div className="rounded-xl bg-primary/10 p-4">
                        <p className="text-sm font-medium text-primary">
                            以<strong>所需样本量最大的那个指标</strong>为准来确定样本量，
                            从而保证所有指标都能达到预期精度。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CostBalanceContent({ params }: { params: SampleParams }) {
    const isMeanEstimation = params.estimationType === "mean";
    const sigma2 = params.populationVariance ?? 100;
    const errorChoices = isMeanEstimation ? buildMeanErrorChoices(params.marginOfError) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const barData = errorChoices.map((e) => ({
        e,
        n: isMeanEstimation
            ? calculateMeanEstimationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: e,
                populationSize: params.populationSize,
                populationVariance: sigma2,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? 0
            : calculateFinitePopulationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: e,
                populationSize: params.populationSize,
                designEffect: 1,
                nonResponseRate: 0,
            }) ?? 0,
    }));
    const maxN = Math.max(...barData.map((d) => d.n), 1);

    return (
        <div className="flex flex-col gap-6">
            <p className={sectionTextClass}>
                精度提升的边际收益<strong className="text-foreground">递减</strong>：
                {isMeanEstimation ? "每减少一部分绝对误差限，所需额外样本量都会更快地增加。" : "每减少一个百分点的误差限，所需额外样本量越来越多。"}
            </p>

            <div className={panelClass}>
                <div className={panelHeaderClass}>
                    <p className="text-center text-sm text-muted-foreground">
                        {isMeanEstimation ? "绝对误差限 vs 样本量" : "误差限 vs 样本量"}
                        <span className="text-xs">
                            {isMeanEstimation
                                ? ` (σ²=${sigma2}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="flex flex-col gap-2 p-4">
                    {barData.map((d) => (
                        <div key={d.e} className="flex items-center gap-3">
                            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(d.e)}` : `±${d.e}%`}
                            </span>
                            <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-300",
                                        d.e === params.marginOfError ? "bg-primary" : "bg-success",
                                    )}
                                    style={{ width: `${Math.max(2, (d.n / maxN) * 100)}%` }}
                                />
                            </div>
                            <span className="w-16 text-right text-xs font-medium tabular-nums text-foreground">
                                {d.n.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={calloutClass}>
                <p className="text-sm text-foreground">
                    <strong>实践建议：</strong>找到"精度够用、费用可控"的平衡点。
                    {isMeanEstimation
                        ? " 对均值估计而言，误差限 e 每减半，样本量大约要增加 4 倍。"
                        : " 超过某个阈值后，增加样本量带来的精度提升已经微乎其微。"}
                </p>
            </div>
        </div>
    );
}

function SummaryContent() {
    const factors = [
        { icon: Crosshair, title: "误差限", desc: "容许的最大抽样误差，越小需要的样本越多" },
        { icon: Layers, title: "子总体估计", desc: "需要分域估计时，样本量可能翻数倍" },
        { icon: BarChart3, title: "总体变异", desc: "变异越大，需要更多样本来捕捉总体特征" },
        { icon: DollarSign, title: "精度与费用", desc: "边际递减效应——超过拐点后收益极低" },
    ];

    return (
        <div className="flex flex-col gap-6">
            <p className={sectionTextClass}>
                到这里，你已经看完决定样本量的四类关键条件。
                它们会一起决定“多少样本才够”。
            </p>

            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
                {factors.map(({ icon: FIcon, title, desc }) => (
                    <div key={title} className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <FIcon className="size-4" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </div>

            <div className={calloutClass}>
                <p className="text-sm text-foreground">
                    下一步进入公式阶段：先选估计目标，再把这些条件量化成样本量 n。
                </p>
            </div>
        </div>
    );
}
