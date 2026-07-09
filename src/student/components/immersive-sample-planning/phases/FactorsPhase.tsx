import { useState } from "react";
import { Button } from "@/components/ui/button";
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

export function FactorsPhase({ step, params, onNext }: Props) {
    const meta = STEP_META[step];
    const Icon = meta.icon;

    return (
        <div className="space-y-8">
            <div className="text-center space-y-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-info/10 text-xs font-medium text-info">
                    <Icon className="w-3.5 h-3.5" />
                    {meta.badge}
                </span>
                <h2 className="text-2xl font-bold text-foreground">{meta.label}</h2>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">{meta.intro}</p>
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
                    className="bg-primary hover:bg-primary text-primary-foreground px-8 py-5 rounded-xl shadow-lg shadow-primary/20"
                >
                    {step === "summary" ? "继续：进入样本量公式" : "继续：看下一个因素"}
                    <ChevronRight className="w-5 h-5 ml-2" />
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
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-sm">
                {isMeanEstimation ? (
                    <>
                        绝对误差限 <strong className="text-foreground/90">e</strong> 越小，对均值估计的精度要求越高，
                        所需样本量按 <strong className="text-foreground/90">1/e²</strong> 增长。
                    </>
                ) : (
                    <>
                        误差限越小，对精度的要求越高，所需样本量呈<strong className="text-foreground/90">非线性增长</strong>。
                        通常需要在可接受的误差和可承受的成本之间取得平衡。
                    </>
                )}
            </p>

            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background dark:bg-card shadow-sm overflow-hidden">
                <div className="bg-card dark:bg-muted/50 px-4 py-2.5 border-b border-border dark:border-input">
                    <p className="text-sm text-center text-muted-foreground">
                        {isMeanEstimation ? "不同绝对误差限下的样本量" : "不同误差限下的样本量"}
                        <span className="text-xs">
                            {isMeanEstimation
                                ? ` (σ²=${sigma2}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex gap-2 flex-wrap justify-center" role="group" aria-label="选择误差限">
                        {errors.map((e) => (
                            <button
                                key={e}
                                type="button"
                                onClick={() => setDemoError(e)}
                                aria-pressed={demoError === e}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    demoError === e
                                        ? "bg-info text-info-foreground shadow-sm"
                                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/50"
                                }`}
                            >
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(e)}` : `±${e}%`}
                            </button>
                        ))}
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">所需样本量</p>
                        <p className="text-3xl font-black tabular-nums text-info">
                            {demoN.toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-xl border border-info bg-info/50 p-4">
                <p className="text-sm text-info">
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
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-sm">
                如果需要分别估计各<strong className="text-foreground/90">子总体</strong>（域）的参数，
                每个域都需要足够的样本量来保证精度。这里的示例把子总体视为<strong className="text-foreground/90">互不重叠的年龄层</strong>，
                因此总样本量按各层样本量求和，会显著高于仅做整体估计的需求。
                {isMeanEstimation && ` 这里为便于比较，暂假定各层方差近似相同，统一使用 σ²=${sigma2}。`}
            </p>

            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background dark:bg-card shadow-sm overflow-hidden">
                <div className="bg-card dark:bg-muted/50 px-4 py-2.5 border-b border-border dark:border-input">
                    <p className="text-sm text-center text-muted-foreground">
                        {isMeanEstimation
                            ? `方案对比示例：按互斥年龄层分别估计均值 (±${formatAbsoluteErrorValue(params.marginOfError)}, σ²=${sigma2}, ${params.confidenceLevel}% CI)`
                            : `方案对比示例：按互斥年龄层分别估计 (±5%, ${params.confidenceLevel}% CI)`}
                    </p>
                </div>
                <div className="divide-y divide-border">
                    <div className="flex items-center justify-between px-4 py-3 bg-info/50">
                        <span className="text-sm font-medium text-info">方案1: 仅做整体估计</span>
                        <span className="text-sm font-bold tabular-nums text-info">n = {nOverall.toLocaleString()}</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-destructive">方案2: 各子总体分别估计</span>
                            <span className="text-sm font-bold tabular-nums text-destructive">n ≈ {totalDomainSample.toLocaleString()}</span>
                        </div>
                        <div className="space-y-1 pl-3">
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
                <div className="mx-auto max-w-lg rounded-xl border border-warning bg-warning/50 p-4">
                    <p className="text-sm text-warning">
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
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-sm">
                这一步是在判断公式里的“变异度”该怎么理解。变异越大，需要的样本越多。
            </p>

            <div className="mx-auto max-w-lg space-y-4">
                <div className="rounded-2xl border border-border bg-background dark:bg-card p-5 shadow-sm space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground/90">比例估计中的变异</p>
                        <p className="text-sm text-muted-foreground">
                            p(1−p) 在 p=0.5 时取最大值 0.25（最大方差）。
                            当比例越接近 0 或 1 时，方差越小，所需样本量越少。
                            <strong> 不确定 p 时，取 p=0.5 是最保守的选择。</strong>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground/90">均值估计中的变异</p>
                        <p className="text-sm text-muted-foreground">
                            需要总体方差 σ² 的先验估计。常用的获取途径：
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 pl-2">
                            <li>历史调查数据</li>
                            <li>小规模预调查（pilot survey）</li>
                            <li>相似总体的经验值</li>
                        </ul>
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-background dark:bg-card p-5 shadow-sm space-y-3">
                    <p className="text-sm font-semibold text-foreground/90">多指标时的变异处理</p>
                    <p className="text-sm text-muted-foreground">
                        调查通常涉及多个指标，各指标的方差不同。原则上：
                    </p>
                    <div className="rounded-xl bg-primary p-4">
                        <p className="text-sm text-primary font-medium">
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
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-sm">
                精度提升的边际收益<strong className="text-foreground/90">递减</strong>：
                {isMeanEstimation ? "每减少一部分绝对误差限，所需额外样本量都会更快地增加。" : "每减少一个百分点的误差限，所需额外样本量越来越多。"}
            </p>

            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background dark:bg-card shadow-sm overflow-hidden">
                <div className="bg-card dark:bg-muted/50 px-4 py-2.5 border-b border-border dark:border-input">
                    <p className="text-sm text-center text-muted-foreground">
                        {isMeanEstimation ? "绝对误差限 vs 样本量" : "误差限 vs 样本量"}
                        <span className="text-xs">
                            {isMeanEstimation
                                ? ` (σ²=${sigma2}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="p-4 space-y-2">
                    {barData.map((d) => (
                        <div key={d.e} className="flex items-center gap-3">
                            <span className="text-xs tabular-nums text-muted-foreground w-14 text-right">
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(d.e)}` : `±${d.e}%`}
                            </span>
                            <div className="flex-1 h-5 rounded-full bg-muted-foreground/50 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        d.e === params.marginOfError
                                            ? "bg-primary"
                                            : "bg-info"
                                    }`}
                                    style={{ width: `${Math.max(2, (d.n / maxN) * 100)}%` }}
                                />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-16 text-right font-medium">
                                {d.n.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-xl border border-info bg-info/50 p-4">
                <p className="text-sm text-info">
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
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-sm">
                到这里，你已经看完决定样本量的四类关键条件。
                它们会一起决定“多少样本才够”。
            </p>

            <div className="mx-auto max-w-lg grid grid-cols-2 gap-3">
                {factors.map(({ icon: FIcon, title, desc }) => (
                    <div key={title} className="rounded-2xl border border-border bg-background dark:bg-card p-4 shadow-sm space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-info flex items-center justify-center">
                            <FIcon className="w-4 h-4 text-info" />
                        </div>
                        <p className="text-sm font-semibold text-foreground/90">{title}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </div>

            <div className="mx-auto max-w-lg rounded-xl border border-primary bg-primary/50 p-4">
                <p className="text-sm text-primary">
                    下一步进入公式阶段：先选估计目标，再把这些条件量化成样本量 n。
                </p>
            </div>
        </div>
    );
}
