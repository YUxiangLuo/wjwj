import { useState } from "react";
import { formatStatistic } from "@/utils/statistic-format";
import { Button } from "@/components/ui/button";
import { ChevronRight, Crosshair, Layers, BarChart3, DollarSign, CheckCircle2, Boxes, UserX } from "lucide-react";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../../experiment/sample-plan";
import type { SampleParams } from "../types";
import type { FactorsStep } from "../types";
import { PlanningHeading } from "../PlanningShared";
import { IconTile } from "@/components/IconTile";
import { StatusBadge } from "@/components/StatusBadge";

interface Props {
    step: FactorsStep;
    params: SampleParams;
    onNext: () => void;
    onStepChange?: (step: FactorsStep) => void;
    hideNext?: boolean;
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
    design_effect: {
        label: "抽样设计的影响",
        badge: "因素 4",
        icon: Boxes,
        intro: "设计效应是同一估计量的设计方差与简单随机方差之比，可能大于或小于 1；它取决于目标变量、分配和权重。",
    },
    non_response: {
        label: "不是每个单位都能获得回答",
        badge: "因素 5",
        icon: UserX,
        intro: "公式算出的是需要完成的有效样本数。部分单位不会回答——要达到目标样本数，邀请时还要按无回答率适当增加。",
    },
    cost_balance: {
        label: "精度与费用的平衡",
        badge: "因素 6",
        icon: DollarSign,
        intro: "最后把统计精度和调查成本放在一起看，找到既合理又可执行的样本量。",
    },
    summary: {
        label: "六因素汇总",
        badge: "汇总",
        icon: CheckCircle2,
        intro: "用这张小结比较六类因素的作用，可自由选择感兴趣的因素查看示例。",
    },
};

function formatAbsoluteErrorValue(value: number): string {
    return formatStatistic(value);
}

function buildMeanErrorChoices(current: number) {
    const scale = Number.isFinite(current) && current > 0 ? current : 2;
    const base = [0.25, 0.5, 1, 2, 4].map((factor) => scale * factor).filter((value) => Number.isFinite(value) && value > 0);
    return [...new Set(base)].sort((a, b) => a - b);
}

export function FactorsPhase({ step, params, onNext, onStepChange, hideNext = false }: Props) {
    const meta = STEP_META[step];

    return (
        <div className="space-y-6">
            <PlanningHeading title="哪些条件会改变样本量？" description="自由查看六类因素，无需依次完成。这里的示例用于理解原理；实际参数在「调整方案」中统一设置。"/>
            {onStepChange && <div className="flex flex-wrap gap-2" role="group" aria-label="选择影响因素">
                {(Object.keys(STEP_META) as FactorsStep[]).map(key => <Button key={key} type="button" variant={step === key ? "default" : "outline"}
                    aria-pressed={step === key} onClick={() => onStepChange(key)} className="min-h-11 whitespace-normal text-left">
                    {STEP_META[key].label}
                </Button>)}
            </div>}
            <div className="space-y-2 border-t border-border pt-5">
                <StatusBadge intent="info">{meta.badge}</StatusBadge>
                <h3 className="text-section-title font-semibold text-foreground">{meta.label}</h3>
                <p className="text-label text-muted-foreground">{meta.intro}</p>
            </div>

            {step === "error_tolerance" && <ErrorToleranceContent params={params} />}
            {step === "subpopulation" && <SubpopulationContent params={params} />}
            {step === "variability" && <VariabilityContent />}
            {step === "design_effect" && <DesignEffectContent params={params} />}
            {step === "non_response" && <NonResponseContent params={params} />}
            {step === "cost_balance" && <CostBalanceContent params={params} />}
            {step === "summary" && <SummaryContent />}

            {!hideNext && <div className="flex justify-center">
                <Button
                    type="button"
                    onClick={onNext}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground px-8 py-5 rounded-surface "
                >
                    {step === "summary" ? "继续：进入四步法小结" : "继续：看下一个因素"}
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>}
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
    const finiteSampleAtFivePercent = isMeanEstimation
        ? null
        : calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: 5,
            populationSize: params.populationSize,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0;
    const finiteSampleAtOnePercent = isMeanEstimation
        ? null
        : calculateFinitePopulationSampleSize({
            confidenceLevel: params.confidenceLevel,
            marginOfError: 1,
            populationSize: params.populationSize,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0;
    const finitePopulationRatio =
        finiteSampleAtFivePercent && finiteSampleAtOnePercent
            ? finiteSampleAtOnePercent / finiteSampleAtFivePercent
            : null;

    return (
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-label">
                {isMeanEstimation ? (
                    <>
                        绝对误差限 <strong className="text-foreground">e</strong> 越小，对均值估计的精度要求越高，
                        忽略有限总体修正时，基准样本量与 <strong className="text-foreground">1/e²</strong> 成比例；有限总体下增幅趋缓，上限为 N。
                    </>
                ) : (
                    <>
                        误差限越小，对精度的要求越高，所需样本量呈<strong className="text-foreground">非线性增长</strong>。
                        通常需要在可接受的误差和可承受的成本之间取得平衡。
                    </>
                )}
            </p>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <p className="text-label text-center text-muted-foreground">
                        {isMeanEstimation ? "不同绝对误差限下的样本量" : "不同误差限下的样本量"}
                        <span className="text-meta">
                            {isMeanEstimation
                                ? ` (σ²=${formatAbsoluteErrorValue(sigma2)}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
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
                                className={`px-3 py-1.5 rounded-surface text-label font-medium transition-none ${
                                    demoError === e
                                        ? "bg-info text-info-foreground "
                                        : "bg-muted text-muted-foreground hover:bg-input"
                                }`}
                            >
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(e)}` : `±${e}%`}
                            </button>
                        ))}
                    </div>
                    <div className="text-center">
                        <p className="text-meta text-muted-foreground">所需样本量</p>
                        <p className="text-display font-black tabular-nums text-info">
                            {demoN.toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-info-border bg-info-muted p-4">
                <p className="text-label text-info">
                    {isMeanEstimation ? (
                        <>
                            <strong>关键洞察：</strong>只有在有限总体修正可忽略时，把绝对误差限减半才使未取整的基准样本量增加到 4 倍。
                            教学中常先用历史数据或预调查估计 σ²，再根据业务能接受的绝对误差来定样本量。
                        </>
                    ) : (
                        <>
                            <strong>关键洞察：</strong>在未考虑有限总体校正的初始公式 n₀ 中，误差限从 5% 缩小到 1%，
                            n₀ 会增加 25 倍。
                            {finitePopulationRatio !== null && (
                                <>
                                    {" "}但当前 N={params.populationSize.toLocaleString()} 时，有限总体校正后的样本量由
                                    {" "}{finiteSampleAtFivePercent?.toLocaleString()} 增至 {finiteSampleAtOnePercent?.toLocaleString()}，
                                    实际约为 {finitePopulationRatio.toFixed(2)} 倍。
                                </>
                            )}
                            {" "}在实际项目中，±3%~5% 是最常见的精度要求。
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
            <p className="text-center text-muted-foreground text-label">
                如果需要分别估计各<strong className="text-foreground">子总体</strong>（域）的参数，
                每个域都需要足够的样本量来保证精度。这里的示例把子总体视为<strong className="text-foreground">互不重叠的年龄层</strong>，
                因此总样本量按各层样本量求和，会显著高于仅做整体估计的需求。
                {isMeanEstimation && ` 这里为便于比较，暂假定各层方差近似相同，统一使用 σ²=${formatAbsoluteErrorValue(sigma2)}。`}
            </p>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <p className="text-label text-center text-muted-foreground">
                        {isMeanEstimation
                            ? `方案对比示例：按互斥年龄层分别估计均值 (±${formatAbsoluteErrorValue(params.marginOfError)}, σ²=${formatAbsoluteErrorValue(sigma2)}, ${params.confidenceLevel}% CI)`
                            : `方案对比示例：按互斥年龄层分别估计 (±5%, ${params.confidenceLevel}% CI)`}
                    </p>
                </div>
                <div className="divide-y divide-border">
                    <div className="flex items-center justify-between px-4 py-3 bg-info-muted">
                        <span className="text-label font-medium text-info">方案1: 仅做整体估计</span>
                        <span className="text-label font-bold tabular-nums text-info">n = {nOverall.toLocaleString()}</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-label font-medium text-destructive">方案2: 各子总体分别估计</span>
                            <span className="text-label font-bold tabular-nums text-destructive">n ≈ {totalDomainSample.toLocaleString()}</span>
                        </div>
                        <div className="space-y-1 pl-3">
                            {domainSizes.map((d) => (
                                <div key={d.name} className="flex items-center justify-between text-meta text-muted-foreground">
                                    <span>{d.name} (N={d.domainN.toLocaleString()})</span>
                                    <span className="tabular-nums">{d.domainSample.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {totalDomainSample > nOverall && nOverall > 0 && (
                <div className="mx-auto max-w-lg rounded-surface border border-warning-border bg-warning-muted p-4">
                    <p className="text-label text-warning">
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
            <p className="text-center text-muted-foreground text-label">
                这一步是在判断公式里的“变异度”该怎么理解。变异越大，需要的样本越多。
            </p>

            <div className="mx-auto max-w-lg space-y-4">
                <div className="rounded-surface border border-border bg-background p-5 space-y-4">
                    <div className="space-y-2">
                        <p className="text-label font-semibold text-foreground">比例估计中的变异</p>
                        <p className="text-label text-muted-foreground">
                            p(1−p) 在 p=0.5 时取最大值 0.25（最大方差）。
                            <strong> 当目标是控制比例估计的绝对 Wald 误差限时，不确定 p 可取 0.5 作该公式下的保守规划。</strong>
                            稀有事件、相对误差或最低期望事件数目标不适用这一规则；p 接近 0 或 1、小样本时，Wald 正态近似也可能不可靠，应考虑更合适的区间或模拟规划。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label font-semibold text-foreground">均值估计中的变异</p>
                        <p className="text-label text-muted-foreground">
                            需要总体方差 σ² 的先验估计。常用的获取途径：
                        </p>
                        <ul className="text-label text-muted-foreground list-disc list-inside space-y-1 pl-2">
                            <li>历史调查数据</li>
                            <li>小规模预调查（pilot survey）</li>
                            <li>相似总体的经验值</li>
                        </ul>
                    </div>
                </div>

                <div className="rounded-surface border border-border bg-background p-5 space-y-3">
                    <p className="text-label font-semibold text-foreground">多指标时的变异处理</p>
                    <p className="text-label text-muted-foreground">
                        调查通常涉及多个指标，各指标的方差不同。原则上：
                    </p>
                    <div className="rounded-surface bg-primary-muted p-4">
                        <p className="text-label text-primary font-medium">
                            以<strong>所需样本量最大的那个指标</strong>为准来确定样本量，
                            从而保证所有指标都能达到预期精度。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DesignEffectContent({ params }: { params: SampleParams }) {
    const isMeanEstimation = params.estimationType === "mean";
    const sigma2 = params.populationVariance ?? 100;
    const deffChoices = [1, 1.5, 2, 3];
    const [demoDeff, setDemoDeff] = useState(2);
    const barData = deffChoices.map((deff) => ({
        deff,
        n: isMeanEstimation
            ? calculateMeanEstimationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: params.populationSize,
                populationVariance: sigma2,
                designEffect: deff,
                nonResponseRate: 0,
            }) ?? 0
            : calculateFinitePopulationSampleSize({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: params.populationSize,
                designEffect: deff,
                nonResponseRate: 0,
            }) ?? 0,
    }));
    const maxN = Math.max(...barData.map((d) => d.n), 1);
    const demoN = barData.find((d) => d.deff === demoDeff)?.n ?? 0;
    const baseN = barData.find((d) => d.deff === 1)?.n ?? 0;

    return (
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-label">
                设计效应 <strong className="text-foreground">deff = 复杂设计的方差 ÷ 简单随机抽样的方差</strong>。
                deff 越大，同样样本量能达到的精度越低，规划时就要把样本量按 deff 放大。
            </p>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <p className="text-label text-center text-muted-foreground">
                        不同设计效应下的样本量
                        <span className="text-meta">
                            {isMeanEstimation
                                ? ` (±${formatAbsoluteErrorValue(params.marginOfError)}, σ²=${formatAbsoluteErrorValue(sigma2)}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (±${params.marginOfError}%, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="p-4 space-y-2">
                    <div className="flex gap-2 flex-wrap justify-center" role="group" aria-label="选择设计效应">
                        {deffChoices.map((deff) => (
                            <button
                                key={deff}
                                type="button"
                                onClick={() => setDemoDeff(deff)}
                                aria-pressed={demoDeff === deff}
                                className={`px-3 py-1.5 rounded-surface text-label font-medium transition-none ${
                                    demoDeff === deff
                                        ? "bg-info text-info-foreground "
                                        : "bg-muted text-muted-foreground hover:bg-input"
                                }`}
                            >
                                deff = {deff}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2 pt-2">
                        {barData.map((d) => (
                            <div key={d.deff} className="flex items-center gap-3">
                                <span className="text-meta tabular-nums text-muted-foreground w-16 text-right">deff {d.deff}</span>
                                <div className="flex-1 h-5 rounded-control bg-input overflow-hidden">
                                    <div
                                        className={`h-full rounded-control transition-[width,background-color] duration-300 ${d.deff === demoDeff ? "bg-primary" : "bg-info"}`}
                                        style={{ width: `${Math.max(2, (d.n / maxN) * 100)}%` }}
                                    />
                                </div>
                                <span className="text-meta tabular-nums text-muted-foreground w-16 text-right font-medium">
                                    {d.n.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background p-5 space-y-3">
                <p className="text-label font-semibold text-foreground">deff 从哪里来？</p>
                <ul className="text-label text-muted-foreground list-disc list-inside space-y-1 pl-2">
                    <li>整群抽样：deff ≈ 1 + (平均群规模 − 1) × 群内相关 ρ，群越大、群内越相似，代价越高</li>
                    <li>分层抽样：当层间差异明显时 deff 可以小于 1——好设计反而省样本</li>
                    <li>取值依据：历史调查、小规模预调查或设计模拟，而不是按方法名称拍脑袋</li>
                </ul>
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-info-border bg-info-muted p-4">
                <p className="text-label text-info">
                    <strong>关键洞察：</strong>当前假设下 deff = {demoDeff} 时需要 {demoN.toLocaleString()} 个单位，
                    约为简单随机（{baseN.toLocaleString()} 个单位）的 {baseN > 0 ? (demoN / baseN).toFixed(2) : "—"} 倍。
                    低估 deff 是实际调查中最常见的样本量失误之一。
                </p>
            </div>
        </div>
    );
}

function NonResponseContent({ params }: { params: SampleParams }) {
    const rateChoices = [0, 10, 20, 30, 50];
    const [demoRate, setDemoRate] = useState(20);
    const baseN = Math.max(1, Math.round(params.recommendedSize || 0));
    const rows = rateChoices.map((rate) => {
        const invite = baseN > 0 ? Math.min(params.populationSize, Math.ceil(baseN / (1 - rate / 100))) : 0;
        const completed = rate >= 100 ? 0 : Math.floor(invite * (1 - rate / 100));
        return { rate, invite, completed, capped: invite >= params.populationSize && rate > 0 };
    });
    const maxInvite = Math.max(...rows.map((row) => row.invite), 1);
    const demo = rows.find((row) => row.rate === demoRate) ?? rows[0]!;

    return (
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-label">
                需要完成 <strong className="text-foreground">n</strong> 个有效样本，并不等于只需邀请 n 个总体单位。
                无回答率 r 越高，发放量要按 <strong className="text-foreground">n ÷ (1 − r)</strong> 放得越大，并以总体规模封顶。
            </p>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <p className="text-label text-center text-muted-foreground">
                        不同无回答率下的发放量与预计完成量
                        <span className="text-meta"> (目标完成 {baseN.toLocaleString()} 个有效样本，N={params.populationSize.toLocaleString()})</span>
                    </p>
                </div>
                <div className="p-4 space-y-2">
                    <div className="flex gap-2 flex-wrap justify-center" role="group" aria-label="选择无回答率">
                        {rateChoices.map((rate) => (
                            <button
                                key={rate}
                                type="button"
                                onClick={() => setDemoRate(rate)}
                                aria-pressed={demoRate === rate}
                                className={`px-3 py-1.5 rounded-surface text-label font-medium transition-none ${
                                    demoRate === rate
                                        ? "bg-info text-info-foreground "
                                        : "bg-muted text-muted-foreground hover:bg-input"
                                }`}
                            >
                                {rate}%
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2 pt-2">
                        {rows.map((row) => (
                            <div key={row.rate} className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <span className="text-meta tabular-nums text-muted-foreground w-14 text-right">{row.rate}%</span>
                                    <div className="flex-1 h-5 rounded-control bg-input overflow-hidden">
                                        <div
                                            className={`h-full rounded-control transition-[width,background-color] duration-300 ${row.rate === demoRate ? "bg-primary" : "bg-info"}`}
                                            style={{ width: `${Math.max(2, (row.invite / maxInvite) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-meta tabular-nums text-muted-foreground w-40 text-right font-medium">
                                        发 {row.invite.toLocaleString()} / 完成约 {row.completed.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-warning-border bg-warning-muted p-4">
                <p className="text-label text-warning">
                    <strong>关键洞察：</strong>无回答率 {demo.rate}% 时要完成约 {demo.completed.toLocaleString()} 个有效样本，需邀请 {demo.invite.toLocaleString()} 个总体单位
                    {demo.capped && "（已触及总体上限，实际精度会进一步下降）"}。
                    放大发放量只补足数量——回答意愿与调查内容相关时，完成样本仍可能系统性偏斜。
                    降低无回答本身（追访、激励、简短的问卷）比事后加权更重要。
                </p>
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
            <p className="text-center text-muted-foreground text-label">
                误差限越小，所需样本量通常越大；具体增量取决于总体规模与抽样比。接近普查时，有限总体校正会明显改变这一关系。
            </p>

            <div className="mx-auto max-w-lg rounded-surface border border-border bg-background overflow-hidden">
                <div className="bg-card px-4 py-2.5 border-b border-border">
                    <p className="text-label text-center text-muted-foreground">
                        {isMeanEstimation ? "绝对误差限 vs 样本量" : "误差限 vs 样本量"}
                        <span className="text-meta">
                            {isMeanEstimation
                                ? ` (σ²=${formatAbsoluteErrorValue(sigma2)}, N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`
                                : ` (N=${params.populationSize.toLocaleString()}, ${params.confidenceLevel}% CI)`}
                        </span>
                    </p>
                </div>
                <div className="p-4 space-y-2">
                    {barData.map((d) => (
                        <div key={d.e} className="flex items-center gap-3">
                            <span className="text-meta tabular-nums text-muted-foreground w-14 text-right">
                                {isMeanEstimation ? `±${formatAbsoluteErrorValue(d.e)}` : `±${d.e}%`}
                            </span>
                            <div className="flex-1 h-5 rounded-control bg-input overflow-hidden">
                                <div
                                    className={`h-full rounded-control transition-[width,background-color] duration-300 ${
                                        d.e === params.marginOfError
                                            ? "bg-primary"
                                            : "bg-info"
                                    }`}
                                    style={{ width: `${Math.max(2, (d.n / maxN) * 100)}%` }}
                                />
                            </div>
                            <span className="text-meta tabular-nums text-muted-foreground w-16 text-right font-medium">
                                {d.n.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-info-border bg-info-muted p-4">
                <p className="text-label text-info">
                    <strong>实践建议：</strong>找到"精度够用、费用可控"的平衡点。
                    {isMeanEstimation
                        ? " 在抽样比很小、其余参数固定的近似下，误差限 e 减半，样本量变为原来的约 4 倍。"
                        : " 在抽样比很小、其余参数固定的近似下，误差限减半，样本量变为原来的约 4 倍；当前有限总体应以图中计算为准。"}
                </p>
            </div>
        </div>
    );
}

function SummaryContent() {
    const factors = [
        { icon: Crosshair, title: "误差限", desc: "给定置信水平下的区间半宽目标，不是绝对误差保证" },
        { icon: Layers, title: "子总体估计", desc: "需要分域估计时，样本量可能翻数倍" },
        { icon: BarChart3, title: "总体变异", desc: "变异越大，需要更多样本来捕捉总体特征" },
        { icon: Boxes, title: "设计效应", desc: "deff 是方差之比，可以低于 1；样本量还需结合有限总体修正" },
        { icon: UserX, title: "无回答率", desc: "达到目标有效样本数，邀请量按 1/(1−r) 放大" },
        { icon: DollarSign, title: "精度与费用", desc: "结合抽样比、精度目标与成本比较，无通用拐点" },
    ];

    return (
        <div className="space-y-6">
            <p className="text-center text-muted-foreground text-label">
                这六类关键条件一起决定“多少样本才够”。你可以切换上方的因素，查看具体示例。
            </p>

            <div className="mx-auto max-w-lg grid grid-cols-2 gap-3">
                {factors.map(({ icon: FIcon, title, desc }) => (
                    <div key={title} className="rounded-surface border border-border bg-background p-4 space-y-2">
                        <IconTile intent="info">
                            <FIcon className="w-4 h-4 text-info" />
                        </IconTile>
                        <p className="text-label font-semibold text-foreground">{title}</p>
                        <p className="text-meta text-muted-foreground">{desc}</p>
                    </div>
                ))}
            </div>

            <div className="mx-auto max-w-lg rounded-surface border border-primary-border bg-primary-muted p-4">
                <p className="text-label text-primary">
                    下一步用四步法把这些条件串起来，再进入决策面板确认样本量 n。
                </p>
            </div>
        </div>
    );
}
