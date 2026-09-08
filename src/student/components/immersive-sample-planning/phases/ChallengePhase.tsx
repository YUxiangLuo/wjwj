import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, PencilLine } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { calculatePlannedPrecision, formatPlanningError } from "../../../experiment/planned-precision";
import { PlanningAssumptions, PlanningHeading } from "../PlanningShared";
import { normalizeConfidenceLevel } from "../../../experiment/confidence-level";
import type { EstimationType, SampleParams } from "../types";

interface Props {
    populationSize: number;
    confidenceLevel: string;
    estimationType: EstimationType;
    marginOfError: number;
    populationVariance?: number;
    designEffect?: number;
    nonResponseRate?: number;
    targetDescription?: string;
    recommendedSize: number;
    guess: number | null;
    revealed: boolean;
    onCommitGuess: (guess: number | null) => void;
    onEditGuess?: () => void;
    onAdjust?: () => void;
    onNext: () => void;
    hideNext?: boolean;
}

export function ChallengePhase({ populationSize, confidenceLevel, estimationType, marginOfError,
    populationVariance, designEffect = 1, nonResponseRate = 0, targetDescription,
    recommendedSize, guess, revealed, onCommitGuess, onEditGuess, onAdjust, onNext, hideNext = false }: Props) {
    const inputId = useId();
    const [inputValue, setInputValue] = useState(guess?.toString() ?? "");
    const [showError, setShowError] = useState(false);
    const parsed = Number(inputValue);
    const validInput = /^\d+$/.test(inputValue.trim()) && Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= populationSize;
    const params: SampleParams = { populationSize, confidenceLevel: normalizeConfidenceLevel(confidenceLevel), estimationType,
        marginOfError, populationVariance, designEffect, nonResponseRate, recommendedSize, finalSampleSize: recommendedSize };
    const targetError = formatPlanningError(estimationType === "proportion" ? marginOfError / 100 : marginOfError, estimationType);
    const guessPrecision = guess == null ? null : calculatePlannedPrecision(params, guess);
    const recommendedPrecision = calculatePlannedPrecision(params, recommendedSize);

    return <div className="space-y-6">
        <PlanningHeading title={revealed ? "看看你的选择，能估计得多准" : "先明确目标，再估一个样本量"}
            description={targetDescription ?? (estimationType === "proportion" ? "这次要估计总体中某一类别所占的比例。先了解要求，再试着给出你的选择。" : "这次要估计研究指标的总体均值。先了解要求，再试着给出你的选择。")}/>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4 rounded-surface border border-border bg-card p-5">
            <div><dt className="text-meta text-muted-foreground">调查总体</dt><dd className="mt-1 text-section-title font-semibold tabular-nums text-foreground">{populationSize.toLocaleString()} <span className="text-body font-normal">个单位</span></dd></div>
            <div><dt className="text-meta text-muted-foreground">目标置信水平</dt><dd className="mt-1 text-section-title font-semibold tabular-nums text-foreground">{confidenceLevel}%</dd></div>
            <div><dt className="text-meta text-muted-foreground">{estimationType === "mean" ? "目标绝对误差限" : "目标误差限"}</dt><dd className="mt-1 text-section-title font-semibold tabular-nums text-foreground">{targetError}</dd></div>
        </dl>
        {!revealed ? <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
            <form noValidate onSubmit={(event) => {
                event.preventDefault(); setShowError(true);
                if (validInput) onCommitGuess(parsed);
            }} className="rounded-surface border border-primary-border bg-card p-6 space-y-5">
                <div className="space-y-2">
                    <Label htmlFor={inputId} className="text-subheading font-semibold text-foreground">你准备调查多少个单位？</Label>
                    <p id={`${inputId}-hint`} className="text-label text-muted-foreground">在下方输入 1～{populationSize.toLocaleString()} 之间的整数。</p>
                </div>
                <div className="relative">
                    <Input id={inputId} type="number" inputMode="numeric" min={1} max={populationSize} step={1}
                        placeholder={`例如 ${Math.max(1, Math.floor(populationSize / 4))}`} value={inputValue}
                        aria-describedby={`${inputId}-hint${showError && !validInput ? ` ${inputId}-error` : ""}`}
                        aria-invalid={showError && !validInput}
                        onChange={event => { setInputValue(event.target.value); setShowError(false); }}
                        data-testid="immersive-sp-guess-input"
                        className="h-14 border-input bg-background pr-24 text-section-title font-semibold tabular-nums"/>
                    <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-body text-muted-foreground">个单位</span>
                </div>
                {showError && !validInput && <p id={`${inputId}-error`} role="alert" className="text-label text-destructive">请输入 1～{populationSize.toLocaleString()} 之间的整数，不支持小数。</p>}
                <Button type="submit" data-testid="immersive-sp-guess-submit" className="w-full min-h-12 whitespace-normal">
                    查看我的估计对应的精度 <ArrowRight className="ml-2 h-4 w-4 shrink-0"/>
                </Button>
                <p className="text-meta text-muted-foreground">这只是一次尝试，不计分，也不会直接设为最终样本量。</p>
            </form>
            <div className="space-y-4 py-2">
                <h3 className="text-subheading font-semibold text-foreground">“够准”取决于什么？</h3>
                <p className="text-body text-muted-foreground leading-relaxed">{estimationType === "proportion"
                    ? `这里的 ${targetError} 是比例的绝对误差。例如估计值为 50% 时，误差限描述的是它上下各 ${marginOfError} 个百分点的范围。`
                    : `这里的 ${targetError} 与研究指标使用同一单位。例如时长以小时记录，误差限也以小时表示。`}</p>
                <PlanningAssumptions params={params}/>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => onCommitGuess(null)}>暂不估计，直接查看建议</Button>
            </div>
        </div> : <>
            <div className={`grid gap-4 ${guessPrecision ? "grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]" : ""}`}>
                {guessPrecision && <section className="space-y-4 rounded-surface border border-border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-subheading font-semibold">你的估计</h3><StatusBadge intent={guessPrecision.meetsTarget ? "success" : "warning"}>{guessPrecision.meetsTarget ? "预计达到目标" : "预计未达到目标"}</StatusBadge></div>
                    <p className="text-display font-bold tabular-nums text-foreground">{guess} <span className="text-body font-normal text-muted-foreground">个单位</span></p>
                    <p className="text-body text-muted-foreground">预期误差限 <strong className="font-semibold text-foreground">{formatPlanningError(guessPrecision.marginOfError, estimationType)}</strong></p>
                    <p className="text-label text-muted-foreground">{guessPrecision.meetsTarget ? "在当前假设下，这个样本量可以达到设定的精度。" : `距离 ${targetError} 的目标还有差距。增加样本量，或在后面调整精度要求。`}</p>
                    {onEditGuess && <Button type="button" variant="outline" onClick={onEditGuess}><PencilLine className="mr-2 h-4 w-4"/>换个数字试试</Button>}
                </section>}
                <section className="space-y-4 rounded-surface border border-primary-border bg-primary-muted p-5">
                    <h3 className="text-subheading font-semibold text-primary">当前条件下的参考方案</h3>
                    <p className="text-display font-bold tabular-nums text-primary">{recommendedSize} <span className="text-body font-normal">个单位</span></p>
                    <p className="text-body text-foreground">{nonResponseRate > 0 ? "计划邀请" : "建议调查"}总体的 {Number((recommendedSize / populationSize * 100).toFixed(1))}%</p>
                    <div className="h-3 overflow-hidden rounded-control bg-card" aria-hidden="true"><div className="h-full bg-primary" style={{width: `${recommendedSize / populationSize * 100}%`}}/></div>
                    {recommendedPrecision && <p className="text-label text-foreground">预期误差限 {formatPlanningError(recommendedPrecision.marginOfError, estimationType)}{!recommendedPrecision.meetsTarget && "，全体发放仍预计无法达到目标。"}</p>}
                </section>
            </div>
            <div className="space-y-3 rounded-surface border border-border bg-card p-5">
                <h3 className="text-subheading font-semibold text-foreground">为什么可能需要调查大半个总体？</h3>
                <p className="text-body text-muted-foreground">总体较小、精度要求较高时，抽样比例可能很大。建议值已经考虑有限总体校正，并向上取整；它会随误差限、抽样设计和回答率改变。</p>
                <PlanningAssumptions params={params}/>
            </div>
            <div className="flex flex-wrap gap-3">
                {!hideNext && <Button type="button" onClick={onNext} data-testid="immersive-sp-challenge-next">继续：认识精度 <ArrowRight className="ml-2 h-4 w-4"/></Button>}
                {onAdjust && <Button type="button" variant="outline" onClick={onAdjust}>已了解，直接调整方案</Button>}
            </div>
        </>}
    </div>;
}
