import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SamplingObservationNotice } from "../SamplingObservationNotice";
import { DraftSaveStatus } from "../DraftSaveStatus";
import type { DraftSaveState } from "../../experiment/experiment-draft";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../experiment/sample-plan";
import { normalizeConfidenceLevel, type ConfidenceLevel } from "@/domain/statistics/confidence-level";
import { calculatePlannedPrecision } from "../../experiment/planned-precision";
import { PlanningHeading, PlanningOutcome, PlanningAssumptions } from "./PlanningShared";
import type { AdvancedNonStandardSampleSource } from "../sample-planning/advancedTabs";
import type { AdvancedPlanSnapshot } from "../../experiment/advanced-plan";
import type { Domain } from "../DomainEstimationManager";
import type { SurveyVariable } from "../MultiVariableSamplePlan";
import { usePhaseState } from "./usePhaseState";
import type { EstimationType, SampleParams, SamplePlanningWizardDraft } from "./types";
import { DecisionPhase } from "./phases/DecisionPhase";
import { PlanningReference } from "./PlanningReference";

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

interface Props {
    populationSize: number;
    targetDescription?: string;
    minimumSampleSize?: number;
    initialConfidenceLevel?: string;
    initialMarginOfError?: number;
    initialDesignEffect?: number;
    initialNonResponseRate?: number;
    initialFinalSampleSize?: number;
    initialEstimationType?: EstimationType;
    initialPopulationVariance?: number;
    initialAdvancedPlanSource?: AdvancedNonStandardSampleSource | null;
    initialAdvancedPlans?: AdvancedPlanSnapshot[];
    estimationLocked?: boolean;
    initialDraft?: SamplePlanningWizardDraft | null;
    draftSaveStatus?: DraftSaveState;
    onRetryDraftSave?: () => void;
    onDraftChange?: (draft: SamplePlanningWizardDraft) => void;
    onComplete: (params: SampleParams) => void;
    onClose: () => void;
}

export function ImmersiveSamplePlanning({
    populationSize, targetDescription, minimumSampleSize = 1,
    initialConfidenceLevel = "95", initialMarginOfError,
    initialDesignEffect = 1, initialNonResponseRate = 0, initialFinalSampleSize,
    initialEstimationType = "proportion", initialPopulationVariance = 100,
    initialAdvancedPlanSource = null, initialAdvancedPlans = [], estimationLocked = false, initialDraft = null,
    onDraftChange, draftSaveStatus = "idle", onRetryDraftSave, onComplete, onClose,
}: Props) {
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>(() => initialDraft?.confidenceLevel ?? normalizeConfidenceLevel(initialConfidenceLevel));
    const [marginOfError, setMarginOfError] = useState(initialDraft?.marginOfError ?? initialMarginOfError ?? (initialEstimationType === "mean" ? 2 : 5));
    const [designEffect, setDesignEffect] = useState(initialDraft?.designEffect ?? initialDesignEffect);
    const [nonResponseRate, setNonResponseRate] = useState(initialDraft?.nonResponseRate ?? initialNonResponseRate);
    const [estimationType] = useState<EstimationType>(estimationLocked ? initialEstimationType : initialDraft?.estimationType ?? initialEstimationType);
    const [populationVariance] = useState(initialDraft?.populationVariance ?? initialPopulationVariance);
    const [advancedPlanSource, setAdvancedPlanSource] = useState<AdvancedNonStandardSampleSource | null>(initialDraft ? initialDraft.advancedPlanSource ?? null : initialAdvancedPlanSource);
    const [advancedPlans, setAdvancedPlans] = useState<AdvancedPlanSnapshot[]>(() => initialDraft?.advancedPlans ?? initialAdvancedPlans);
    const handleAdvancedPlanSnapshot = useCallback((snapshot: AdvancedPlanSnapshot) => {
        setAdvancedPlans(previous => [...previous.filter(plan => plan.kind !== snapshot.kind), snapshot]);
    }, []);
    const clearAdvancedPlanSource = useCallback(() => setAdvancedPlanSource(null), []);
    const recommendedSize = useMemo(() => {
        const input = { confidenceLevel, marginOfError, populationSize, populationVariance, designEffect, nonResponseRate };
        return (estimationType === "mean" ? calculateMeanEstimationSampleSize(input) : calculateFinitePopulationSampleSize(input)) ?? 0;
    }, [estimationType, confidenceLevel, marginOfError, populationSize, populationVariance, designEffect, nonResponseRate]);
    const [finalSampleSize, setFinalSampleSize] = useState(initialDraft?.finalSampleSize ?? initialFinalSampleSize ?? Math.max(minimumSampleSize, recommendedSize));
    const [userTouchedFinal, setUserTouchedFinal] = useState(initialDraft?.userTouchedFinal ?? initialFinalSampleSize != null);
    useEffect(() => {
        // A temporarily empty parameter must not wipe the last selected count.
        if (!userTouchedFinal && recommendedSize > 0) setFinalSampleSize(Math.max(minimumSampleSize, recommendedSize));
    }, [recommendedSize, userTouchedFinal, minimumSampleSize]);
    const params: SampleParams = {
        populationSize, minimumSampleSize, estimationType, confidenceLevel, marginOfError,
        populationVariance: estimationType === "mean" ? populationVariance : undefined,
        designEffect, nonResponseRate, finalSampleSize, recommendedSize,
        ...(advancedPlanSource ? { advancedPlanSource } : {}),
        ...(advancedPlans.length > 0 ? { advancedPlans } : {}),
    };
    const paramsRef = useRef(params);
    paramsRef.current = params;
    const [domains, setDomains] = useState<Domain[]>(() => initialDraft?.domains ?? []);
    const [surveyVariables, setSurveyVariables] = useState<SurveyVariable[]>(() => initialDraft?.surveyVariables ?? []);
    const { phase, navigationSnapshot, goNext, goPrev, jumpTo, finish } = usePhaseState(initialDraft?.navigation);
    const onDraftChangeRef = useRef(onDraftChange);
    onDraftChangeRef.current = onDraftChange;
    useLayoutEffect(() => {
        if (phase.type === "done") return;
        onDraftChangeRef.current?.({
            navigation: navigationSnapshot, confidenceLevel, marginOfError, designEffect, nonResponseRate,
            estimationType, populationVariance, finalSampleSize, userTouchedFinal, advancedPlanSource,
            advancedPlans, domains, surveyVariables,
        });
    }, [advancedPlanSource, advancedPlans, confidenceLevel, designEffect, domains, estimationType,
        finalSampleSize, marginOfError, navigationSnapshot, nonResponseRate, phase.type, populationVariance, surveyVariables, userTouchedFinal]);

    const isValidPlan = Number.isInteger(finalSampleSize) && finalSampleSize >= minimumSampleSize
        && finalSampleSize <= populationSize && recommendedSize > 0 && calculatePlannedPrecision(params, finalSampleSize) != null;
    const handleConfirm = useCallback(() => {
        const current = paramsRef.current;
        if (draftSaveStatus === "conflict") return;
        if (Number.isInteger(current.finalSampleSize) && current.finalSampleSize >= minimumSampleSize
            && current.finalSampleSize <= populationSize && current.recommendedSize > 0 && calculatePlannedPrecision(current, current.finalSampleSize)) finish();
        else jumpTo("decision");
    }, [draftSaveStatus, finish, jumpTo, minimumSampleSize, populationSize]);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const doneTriggered = useRef(false);
    useEffect(() => {
        if (phase.type === "done" && !doneTriggered.current) {
            doneTriggered.current = true;
            onCompleteRef.current(paramsRef.current);
        }
    }, [phase.type]);

    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
    const requestClose = useCallback(() => setExitConfirmOpen(true), []);
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    useEffect(() => {
        if (exitConfirmOpen) return;
        const root = contentRef.current;
        if (!root) return;
        const timer = window.setTimeout(() => {
            root.scrollTop = 0;
            root.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [phase.type, exitConfirmOpen]);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || exitConfirmOpen || phase.type === "done") return;
            // Let a nested tool dialog/select handle Escape first.
            if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]') !== overlayRef.current) return;
            event.preventDefault();
            requestClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [exitConfirmOpen, phase.type, requestClose]);
    useEffect(() => {
        const previous = document.body.style.overflow;
        const background = Array.from(document.body.children).filter((element): element is HTMLElement =>
            element instanceof HTMLElement && element !== overlayRef.current && !element.contains(overlayRef.current),
        ).map(element => ({ element, inert: element.inert }));
        background.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
            background.forEach(({ element, inert }) => { element.inert = inert; });
        };
    }, []);
    const focusTrap = useCallback((event: React.KeyboardEvent) => {
        if (exitConfirmOpen || event.key !== "Tab" || !overlayRef.current) return;
        const root = overlayRef.current;
        if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]') !== root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(element => element.getClientRects().length > 0);
        const first = focusables[0], last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }, [exitConfirmOpen]);

    const handleConfidenceLevelChange = useCallback((value: string) => { clearAdvancedPlanSource(); setConfidenceLevel(normalizeConfidenceLevel(value)); }, [clearAdvancedPlanSource]);
    const handleMarginOfErrorChange = useCallback((value: number) => { clearAdvancedPlanSource(); setMarginOfError(value); }, [clearAdvancedPlanSource]);
    const handleDesignEffectChange = useCallback((value: number) => { clearAdvancedPlanSource(); setDesignEffect(value); }, [clearAdvancedPlanSource]);
    const handleNonResponseRateChange = useCallback((value: number) => { clearAdvancedPlanSource(); setNonResponseRate(value); }, [clearAdvancedPlanSource]);
    const handleSetFinalSize = useCallback((value: number) => { clearAdvancedPlanSource(); setUserTouchedFinal(true); setFinalSampleSize(value); }, [clearAdvancedPlanSource]);
    const resetFinalSize = useCallback(() => {
        if (recommendedSize <= 0) return;
        clearAdvancedPlanSource(); setUserTouchedFinal(false); setFinalSampleSize(Math.max(minimumSampleSize, recommendedSize));
    }, [clearAdvancedPlanSource, recommendedSize, minimumSampleSize]);
    if (phase.type === "done") return null;

    return createPortal(<>
        <div ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="immersive-sample-planning"
            className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none" onKeyDown={focusTrap} tabIndex={-1}>
            <header className="shrink-0 border-b border-border bg-card px-6 py-3">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <h1 id={titleId} className="text-subheading font-semibold">样本量规划</h1>
                        <p className="text-meta text-muted-foreground">总体 {populationSize.toLocaleString()} 个单位 · {estimationType === "mean" ? "均值估计" : "比例估计"}</p>
                    </div>
                    <Button type="button" variant="ghost" onClick={requestClose} aria-label="暂时退出样本量规划" data-testid="immersive-sp-close">
                        暂时退出<X className="ml-2 h-4 w-4"/>
                    </Button>
                </div>
            </header>
            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="planning-scroll-content">
                <div className="mx-auto w-full max-w-7xl space-y-4 px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                        <p className="min-w-0 text-label text-foreground">{targetDescription ?? "根据精度要求和调查条件，确定下一阶段实际抽取的样本量。"}</p>
                        <Button type="button" variant="outline" className="shrink-0" onClick={() => jumpTo(phase.type === "reference" ? "decision" : "reference")}
                            aria-pressed={phase.type === "reference"}>
                            <BookOpen className="mr-2 h-4 w-4"/>{phase.type === "reference" ? "返回调整方案" : "计算依据与原理"}
                        </Button>
                    </div>
                    {phase.type === "decision" && <DecisionPhase hideNext params={params}
                        onConfidenceLevelChange={handleConfidenceLevelChange} onMarginOfErrorChange={handleMarginOfErrorChange}
                        onDesignEffectChange={handleDesignEffectChange} onNonResponseRateChange={handleNonResponseRateChange}
                        onFinalSizeChange={handleSetFinalSize} onResetFinalSize={resetFinalSize} onNext={goNext}
                        domains={domains} onDomainsChange={setDomains} surveyVariables={surveyVariables} onSurveyVariablesChange={setSurveyVariables}
                        advancedPlanSource={advancedPlanSource} onAdvancedApplied={setAdvancedPlanSource} onClearAdvancedSource={clearAdvancedPlanSource}
                        onAdvancedPlanSnapshot={handleAdvancedPlanSnapshot}/>}
                    {phase.type === "reference" && <PlanningReference params={params}/>}
                    {phase.type === "confirm" && <div className="mx-auto max-w-4xl space-y-5">
                        <PlanningHeading title="确认这份样本量方案" description="核对实际抽样数量和预期精度。如需修改，可返回调整；确认后立即保存并进入抽样执行。"/>
                        <section className="space-y-5 rounded-surface border border-primary-border bg-card p-6">
                            <div><p className="text-label text-muted-foreground">最终计划邀请</p><p className="mt-1 text-display font-bold tabular-nums text-primary">{finalSampleSize} <span className="text-body font-normal">个单位</span></p></div>
                            <PlanningOutcome params={params}/>
                            <SamplingObservationNotice nonResponseRate={nonResponseRate}/>
                            <dl className="grid grid-cols-4 gap-3">
                                <ParamSummaryItem label="估计类型" value={estimationType === "mean" ? "均值估计" : "比例估计"}/>
                                <ParamSummaryItem label="置信水平" value={confidenceLevel + "%"}/>
                                <ParamSummaryItem label="设计效应" value={designEffect.toFixed(1)}/>
                                <ParamSummaryItem label="预期无回答率" value={Math.round(nonResponseRate * 100) + "%"}/>
                            </dl>
                            <PlanningAssumptions params={params}/>
                        </section>
                    </div>}
                </div>
            </div>
            <footer className="shrink-0 border-t border-border bg-card px-6 py-3" data-testid="planning-actions">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                        <p className="text-label text-foreground">{isValidPlan ? `当前方案：${finalSampleSize.toLocaleString()} 个单位 / 总体 ${populationSize.toLocaleString()}` : "请修正参数或样本量后继续"}</p>
                        {onRetryDraftSave && <DraftSaveStatus status={draftSaveStatus} onRetry={onRetryDraftSave}/>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        {phase.type !== "decision" && <Button type="button" variant="outline" onClick={goPrev}><ChevronLeft className="mr-1 h-4 w-4"/>返回调整</Button>}
                        {phase.type === "decision" && <Button type="button" onClick={goNext} disabled={!isValidPlan || draftSaveStatus === "conflict"}
                            data-testid="immersive-sp-decision-next" className="min-h-11">检查并确认方案<ChevronRight className="ml-2 h-4 w-4"/></Button>}
                        {phase.type === "confirm" && <Button type="button" onClick={handleConfirm} disabled={!isValidPlan || draftSaveStatus === "conflict"}
                            data-testid="immersive-sp-confirm" className="min-h-11">保存规划并进入抽样<ChevronRight className="ml-2 h-4 w-4"/></Button>}
                    </div>
                </div>
            </footer>
        </div>
        <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
            <AlertDialogContent className="z-[60]">
                <AlertDialogHeader>
                    <AlertDialogTitle>退出样本量规划？</AlertDialogTitle>
                    <AlertDialogDescription>{draftSaveStatus === "saved" ? "当前参数已保存到本机，下次打开本阶段时可以继续。" : draftSaveStatus === "error" ? "当前草稿保存失败，请取消退出并重试保存，以免丢失进度。" : "请确认草稿保存成功后再退出。"}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel type="button">取消</AlertDialogCancel>
                    <AlertDialogAction type="button" onClick={() => { setExitConfirmOpen(false); onClose(); }} variant="destructive">确定退出</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>, document.body);
}

function ParamSummaryItem({ label, value }: { label: string; value: string }) {
    return <div className="rounded-surface bg-muted px-3 py-2.5">
        <dt className="text-meta text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-label font-semibold tabular-nums text-foreground">{value}</dd>
    </div>;
}
