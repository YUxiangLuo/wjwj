import { SamplingObservationNotice } from "../SamplingObservationNotice";
import { DraftSaveStatus } from "../DraftSaveStatus";
import type { DraftSaveState } from "../../experiment/experiment-draft";
import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../experiment/sample-plan";
import type { ConfidenceLevel } from "../../experiment/confidence-level";
import { normalizeConfidenceLevel } from "../../experiment/confidence-level";
import { calculatePlannedPrecision } from "../../experiment/planned-precision";
import { PlanningHeading, PlanningOutcome, PlanningAssumptions } from "./PlanningShared";
import type { AdvancedNonStandardSampleSource } from "../sample-planning/advancedTabs";
import type { AdvancedPlanSnapshot } from "../../experiment/advanced-plan";
import type { Domain } from "../DomainEstimationManager";
import type { SurveyVariable } from "../MultiVariableSamplePlan";
import { ImmersiveExperimentLaunch } from "../ImmersiveExperimentLaunch";
import { usePhaseState } from "./usePhaseState";
import {
    PLANNING_STEPS, planningStepIndex,
    type EstimationType,
    type SampleParams,
    type SamplePlanningWizardDraft,
} from "./types";
import { ChallengePhase } from "./phases/ChallengePhase";
import { PrecisionPhase } from "./phases/PrecisionPhase";
import { FactorsPhase } from "./phases/FactorsPhase";
import { FormulaPhase } from "./phases/FormulaPhase";
import { FPCPhase } from "./phases/FPCPhase";
import { FourStepPhase } from "./phases/FourStepPhase";
import { DecisionPhase } from "./phases/DecisionPhase";
import { QuizPhase } from "./phases/QuizPhase";

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

const PHASE_LABELS: Record<string, string> = {
    challenge: "明确目标",
    precision: "认识精度",
    factors: "了解影响因素",
    formula: "进入公式",
    fpc: "总体修正",
    fourstep: "理解推荐",
    decision: "调整方案",
    quiz: "快速自检",
    confirm: "确认方案",
    launching: "进入抽样",
    done: "完成",
};

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
    estimationLocked?: boolean;
    initialDraft?: SamplePlanningWizardDraft | null;
    draftSaveStatus?: DraftSaveState;
    onRetryDraftSave?: () => void;
    onDraftChange?: (draft: SamplePlanningWizardDraft) => void;
    onComplete: (params: SampleParams) => void;
    onClose: () => void;
    /** Called after the launch animation completes (phase reaches "done"). */
    onLaunchComplete?: () => void;
}

export function ImmersiveSamplePlanning({
    populationSize,
    targetDescription,
    minimumSampleSize = 1,
    initialConfidenceLevel = "95",
    initialMarginOfError,
    initialDesignEffect = 1,
    initialNonResponseRate = 0,
    initialFinalSampleSize,
    initialEstimationType = "proportion",
    initialPopulationVariance = 100,
    initialAdvancedPlanSource = null,
    estimationLocked = false,
    initialDraft = null,
    onDraftChange,
    draftSaveStatus = "idle",
    onRetryDraftSave,
    onComplete,
    onClose,
    onLaunchComplete,
}: Props) {
    // --- Parameter state (shared across all phases) ---
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>(() =>
        initialDraft?.confidenceLevel ?? normalizeConfidenceLevel(initialConfidenceLevel ?? "95"),
    );
    const [marginOfError, setMarginOfError] = useState(
        initialDraft?.marginOfError ?? initialMarginOfError ?? (initialEstimationType === "mean" ? 2 : 5),
    );
    const [designEffect, setDesignEffect] = useState(initialDraft?.designEffect ?? initialDesignEffect);
    const [nonResponseRate, setNonResponseRate] = useState(initialDraft?.nonResponseRate ?? initialNonResponseRate);
    const [estimationType, setEstimationType] = useState<EstimationType>(
        estimationLocked ? initialEstimationType : initialDraft?.estimationType ?? initialEstimationType,
    );
    const [populationVariance, setPopulationVariance] = useState(
        initialDraft?.populationVariance ?? initialPopulationVariance,
    );

    const [advancedPlanSource, setAdvancedPlanSource] = useState<AdvancedNonStandardSampleSource | null>(
        initialDraft?.advancedPlanSource ?? initialAdvancedPlanSource,
    );

    // 高级规划快照：每类保留最新一份，随草稿持久化，提交时服务端复算。
    const [advancedPlans, setAdvancedPlans] = useState<AdvancedPlanSnapshot[]>(
        () => initialDraft?.advancedPlans ?? [],
    );
    const handleAdvancedPlanSnapshot = useCallback((snapshot: AdvancedPlanSnapshot) => {
        setAdvancedPlans((previous) => [...previous.filter((plan) => plan.kind !== snapshot.kind), snapshot]);
    }, []);

    const clearAdvancedPlanSource = useCallback(() => {
        setAdvancedPlanSource(null);
    }, []);

    const handleEstimationTypeChange = useCallback((next: EstimationType) => {
        if (estimationLocked) return;
        setEstimationType((prev) => {
            if (prev === next) return prev;
            clearAdvancedPlanSource();
            setMarginOfError(next === "proportion" ? 5 : 2);
            return next;
        });
    }, [clearAdvancedPlanSource, estimationLocked]);

    const recommendedSize = useMemo(() => {
        if (estimationType === "mean") {
            return calculateMeanEstimationSampleSize({
                confidenceLevel,
                marginOfError,
                populationSize,
                populationVariance,
                designEffect,
                nonResponseRate,
            }) ?? Math.min(30, populationSize);
        }
        return calculateFinitePopulationSampleSize({
            confidenceLevel,
            marginOfError,
            populationSize,
            designEffect,
            nonResponseRate,
        }) ?? Math.min(30, populationSize);
    }, [estimationType, confidenceLevel, marginOfError, populationSize, populationVariance, designEffect, nonResponseRate]);

    const [finalSampleSize, setFinalSampleSize] = useState(
        initialDraft?.finalSampleSize ?? initialFinalSampleSize ?? Math.max(minimumSampleSize, recommendedSize),
    );

    // Keep final in sync with recommended when user hasn't touched it yet
    const [userTouchedFinal, setUserTouchedFinal] = useState(
        initialDraft?.userTouchedFinal ?? initialFinalSampleSize != null,
    );
    useEffect(() => {
        if (!userTouchedFinal) {
            setFinalSampleSize(Math.max(minimumSampleSize, recommendedSize));
        }
    }, [recommendedSize, userTouchedFinal, minimumSampleSize]);

    const params: SampleParams = {
        populationSize,
        minimumSampleSize,
        estimationType,
        confidenceLevel,
        marginOfError,
        populationVariance: estimationType === "mean" ? populationVariance : undefined,
        designEffect,
        nonResponseRate,
        finalSampleSize,
        recommendedSize,
        ...(advancedPlanSource ? { advancedPlanSource } : {}),
        ...(advancedPlans.length > 0 ? { advancedPlans } : {}),
    };

    const paramsRef = useRef(params);
    paramsRef.current = params;

    // --- Advanced tools state (session-only, not persisted to backend / SamplePlanData) ---
    const [domains, setDomains] = useState<Domain[]>(() => initialDraft?.domains ?? []);
    const [surveyVariables, setSurveyVariables] = useState<SurveyVariable[]>(() => initialDraft?.surveyVariables ?? []);

    /** Tracks when final sample size currently comes from a non-standard tool. */
    const handleAdvancedApplied = useCallback((source: AdvancedNonStandardSampleSource) => {
        setAdvancedPlanSource(source);
    }, []);

    // --- Phase navigation ---
    const {
        phase,
        setPhase,
        progress,
        navigationSnapshot,
        goNext,
        goPrev,
        jumpTo,
        skipQuiz,
    } = usePhaseState(initialDraft?.navigation);

    const onDraftChangeRef = useRef(onDraftChange);
    onDraftChangeRef.current = onDraftChange;
    useLayoutEffect(() => {
        if (phase.type === "done" || phase.type === "launching") return;
        onDraftChangeRef.current?.({
            navigation: navigationSnapshot,
            confidenceLevel,
            marginOfError,
            designEffect,
            nonResponseRate,
            estimationType,
            populationVariance,
            finalSampleSize,
            userTouchedFinal,
            advancedPlanSource,
            advancedPlans,
            domains,
            surveyVariables,
        });
    }, [
        advancedPlanSource,
        advancedPlans,
        confidenceLevel,
        designEffect,
        domains,
        estimationType,
        finalSampleSize,
        marginOfError,
        navigationSnapshot,
        nonResponseRate,
        phase.type,
        populationVariance,
        surveyVariables,
        userTouchedFinal,
    ]);

    // Return the exact reviewed parameters; the stage page persists this snapshot.
    const handleConfirm = useCallback(() => {
        const n = paramsRef.current.finalSampleSize;
        jumpTo(Number.isInteger(n) && n >= minimumSampleSize && n <= populationSize && calculatePlannedPrecision(paramsRef.current, n) ? "done" : "decision");
    }, [jumpTo, minimumSampleSize, populationSize]);

    const handleLaunchComplete = useCallback(() => {
        jumpTo("done");
    }, [jumpTo]);

    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onLaunchCompleteRef = useRef(onLaunchComplete);
    onLaunchCompleteRef.current = onLaunchComplete;

    const doneTriggered = useRef(false);
    useEffect(() => {
        if (phase.type === "done" && !doneTriggered.current) {
            doneTriggered.current = true;
            onCompleteRef.current(paramsRef.current);
            onLaunchCompleteRef.current?.();
        }
    }, [phase.type]);

    // --- Exit confirmation ---
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

    const hasProgress = phase.type !== "challenge" || phase.guess !== null || phase.revealed;

    const requestClose = useCallback(() => {
        if (hasProgress) {
            setExitConfirmOpen(true);
        } else {
            onClose();
        }
    }, [hasProgress, onClose]);

    const confirmExit = useCallback(() => {
        setExitConfirmOpen(false);
        onClose();
    }, [onClose]);

    // --- Focus management ---
    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    const pageKey =
        phase.type === "formula" ? `formula-${phase.step}`
            : phase.type === "fourstep" ? `fourstep-${phase.scenario}`
                    : phase.type === "quiz" ? `quiz-${phase.questionIndex}`
                        : phase.type === "challenge" ? `challenge-${phase.revealed}` : phase.type;

    useEffect(() => {
        if (exitConfirmOpen) return;
        const root = contentRef.current;
        if (!root) return;
        const t = window.setTimeout(() => {
            root.scrollTop = 0;
            root.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        }, 0);
        return () => window.clearTimeout(t);
    }, [pageKey, exitConfirmOpen]);

    // Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented || exitConfirmOpen || phase.type === "done" || phase.type === "launching") return;
            e.preventDefault();
            requestClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [exitConfirmOpen, phase.type, requestClose]);

    // Prevent body scroll
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

    // Focus trap
    const focusTrap = useCallback(
        (e: React.KeyboardEvent) => {
            if (exitConfirmOpen || e.key !== "Tab" || !overlayRef.current) return;
            const root = overlayRef.current;
            const focusables = Array.from(
                root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => el.offsetParent !== null);
            if (focusables.length === 0) return;
            const first = focusables[0]!;
            const last = focusables[focusables.length - 1]!;
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        },
        [exitConfirmOpen],
    );

    // --- Can navigate? ---
    const canGoNext =
        phase.type === "challenge" ? phase.revealed
            : phase.type === "quiz" || phase.type === "confirm" || phase.type === "launching" || phase.type === "done" ? false
                : true;

    const canGoPrev =
        phase.type !== "challenge"
        && phase.type !== "launching"
        && phase.type !== "done";

    const stepIndex = planningStepIndex(phase.type);
    const isValidPlan = finalSampleSize >= minimumSampleSize && calculatePlannedPrecision(params, finalSampleSize) != null;
    const nextLabel = phase.type === "challenge" ? "继续：认识精度"
        : phase.type === "precision" ? "继续：了解影响因素"
        : phase.type === "factors" ? "继续：理解推荐"
        : phase.type === "decision" ? "继续：检查方案" : "继续：调整方案";

    // --- Standard-flow setters: changing params clears any advanced source tag ---
    const handleConfidenceLevelChange = useCallback((v: string) => {
        clearAdvancedPlanSource();
        setConfidenceLevel(normalizeConfidenceLevel(v));
    }, [clearAdvancedPlanSource]);

    const handleMarginOfErrorChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setMarginOfError(v);
    }, [clearAdvancedPlanSource]);

    const handleDesignEffectChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setDesignEffect(v);
    }, [clearAdvancedPlanSource]);

    const handleNonResponseRateChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setNonResponseRate(v);
    }, [clearAdvancedPlanSource]);

    const handlePopulationVarianceChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setPopulationVariance(v);
    }, [clearAdvancedPlanSource]);

    // --- Handle setting final size (marks user-touched) ---
    const handleSetFinalSize = useCallback((v: number) => {
        // 手动覆盖最终样本量即离开高级规划路径；高级工具应用时会在其后重新标记来源。
        clearAdvancedPlanSource();
        setUserTouchedFinal(true);
        setFinalSampleSize(v);
    }, [clearAdvancedPlanSource]);

    const resetFinalSize = useCallback(() => {
        clearAdvancedPlanSource();
        setUserTouchedFinal(false);
        setFinalSampleSize(Math.max(minimumSampleSize, recommendedSize));
    }, [clearAdvancedPlanSource, recommendedSize, minimumSampleSize]);

    // --- Render current phase ---
    const renderPhase = () => {
        switch (phase.type) {
            case "challenge":
                return (
                    <ChallengePhase
                        populationSize={populationSize}
                        estimationType={estimationType}
                        confidenceLevel={confidenceLevel}
                        marginOfError={marginOfError}
                        populationVariance={populationVariance}
                        designEffect={designEffect}
                        nonResponseRate={nonResponseRate}
                        targetDescription={targetDescription}
                        recommendedSize={recommendedSize}
                        guess={phase.guess}
                        revealed={phase.revealed}
                        onCommitGuess={(g: number | null) =>
                            setPhase((prev) =>
                                prev.type === "challenge" ? { ...prev, guess: g, revealed: true } : prev)}
                        onEditGuess={() => setPhase(prev => prev.type === "challenge" ? { ...prev, revealed: false } : prev)}
                        onAdjust={() => jumpTo("decision")}
                        hideNext
                        onNext={goNext}
                    />
                );
            case "precision":
                return (
                    <PrecisionPhase
                        params={params}
                        initialSampleSize={navigationSnapshot.challenge.guess}
                        hideNext
                        onNext={goNext}
                    />
                );
            case "factors":
                return (
                    <FactorsPhase
                        step={phase.step}
                        params={params}
                        onStepChange={step => setPhase({ type: "factors", step })}
                        hideNext
                        onNext={goNext}
                    />
                );
            case "formula":
                return (
                    <FormulaPhase
                        step={phase.step}
                        params={params}
                        estimationType={estimationType}
                        populationVariance={populationVariance}
                        onEstimationTypeChange={handleEstimationTypeChange}
                        estimationLocked={estimationLocked}
                        onPopulationVarianceChange={handlePopulationVarianceChange}
                        onConfidenceLevelChange={handleConfidenceLevelChange}
                        onMarginOfErrorChange={handleMarginOfErrorChange}
                        onNext={goNext}
                    />
                );
            case "fpc":
                return (
                    <FPCPhase params={params} onNext={goNext} />
                );
            case "fourstep":
                return (
                    <FourStepPhase
                        hideNext
                        scenario={phase.scenario}
                        params={params}
                        estimationType={estimationType}
                        populationVariance={populationVariance}
                        onDesignEffectChange={handleDesignEffectChange}
                        onNonResponseRateChange={handleNonResponseRateChange}
                        onNext={goNext}
                    />
                );
            case "decision":
                return (
                    <DecisionPhase
                        hideNext
                        params={params}
                        onConfidenceLevelChange={handleConfidenceLevelChange}
                        onMarginOfErrorChange={handleMarginOfErrorChange}
                        onDesignEffectChange={handleDesignEffectChange}
                        onNonResponseRateChange={handleNonResponseRateChange}
                        onFinalSizeChange={handleSetFinalSize}
                        onResetFinalSize={resetFinalSize}
                        onNext={goNext}
                        domains={domains}
                        onDomainsChange={setDomains}
                        surveyVariables={surveyVariables}
                        onSurveyVariablesChange={setSurveyVariables}
                        advancedPlanSource={advancedPlanSource}
                        onAdvancedApplied={handleAdvancedApplied}
                        onClearAdvancedSource={clearAdvancedPlanSource}
                        onAdvancedPlanSnapshot={handleAdvancedPlanSnapshot}
                    />
                );
            case "quiz":
                return (
                    <QuizPhase
                        questionIndex={phase.questionIndex}
                        onNext={goNext}
                        onSkip={skipQuiz}
                    />
                );
            case "confirm":
                return <div className="space-y-6">
                    <PlanningHeading title="最后检查一下你的方案" description="确认样本量和预期精度。确认后将保存这份方案，并直接进入抽样执行。"/>
                    <section className="rounded-surface border border-primary-border bg-card p-6 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div><p className="text-label text-muted-foreground">最终计划邀请</p><p className="mt-1 text-display font-bold text-primary tabular-nums">{finalSampleSize} <span className="text-body font-normal">个单位</span></p></div>
                            <Button type="button" variant="outline" onClick={() => jumpTo("decision")}>返回调整</Button>
                        </div>
                        <PlanningOutcome params={params}/>
                        <SamplingObservationNotice nonResponseRate={nonResponseRate}/>
                        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
                            <ParamSummaryItem label="估计类型" value={estimationType === "proportion" ? "比例估计" : "均值估计"}/>
                            <ParamSummaryItem label="置信水平" value={confidenceLevel + "%"}/>
                            <ParamSummaryItem label="设计效应" value={designEffect.toFixed(1)}/>
                            <ParamSummaryItem label="预期无回答率" value={Math.round(nonResponseRate * 100) + "%"}/>
                        </dl>
                        <PlanningAssumptions params={params}/>
                    </section>
                </div>;
            case "launching":
            case "done":
                return null;
        }
    };

    // --- Early returns for terminal phases ---

    if (phase.type === "done") return null;

    if (phase.type === "launching") {
        return (
            <ImmersiveExperimentLaunch
                populationSize={populationSize}
                sampleSize={finalSampleSize}
                estimationType={estimationType}
                confidenceLevel={confidenceLevel}
                marginOfError={marginOfError}
                onComplete={handleLaunchComplete}
                onClose={handleLaunchComplete}
            />
        );
    }

    return createPortal(
        <>
            <div ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
                data-testid="immersive-sample-planning" className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
                onKeyDown={focusTrap} tabIndex={-1}>
                <header className="shrink-0 border-b border-border bg-card px-6 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div><h1 id={titleId} className="text-subheading font-semibold">样本量规划</h1>
                            <p className="mt-0.5 text-meta text-muted-foreground">第 {stepIndex + 1} 步，共 {PLANNING_STEPS.length} 步 · {PHASE_LABELS[phase.type]}</p></div>
                        <Button type="button" variant="ghost" onClick={requestClose} className="min-h-11 shrink-0" aria-label="暂时退出样本量规划" data-testid="immersive-sp-close">
                            <span className="inline">暂时退出</span><X className="h-5 w-5 ml-2"/>
                        </Button>
                    </div>
                    <div className="mt-3 h-1 overflow-hidden rounded-control bg-muted" role="progressbar" aria-label="样本量规划进度" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{width: progress + "%"}}/>
                    </div>
                </header>
                <div className="flex min-h-0 flex-1">
                    <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-border bg-card p-4">
                        <nav aria-label="样本量规划步骤"><ol className="space-y-2">
                            {PLANNING_STEPS.map((step, index) => <li key={step.type}>
                                <button type="button" aria-current={index === stepIndex ? "step" : undefined}
                                    disabled={index > stepIndex} onClick={() => jumpTo(step.type)}
                                    className={"flex w-full items-start gap-3 rounded-control p-3 text-left transition-colors disabled:cursor-not-allowed " + (index === stepIndex ? "bg-primary-muted text-primary" : "text-muted-foreground hover:bg-muted")}>
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-current text-meta font-semibold">{index+1}</span>
                                    <span className="space-y-1"><span className="block text-label font-semibold">{step.label}</span><span className="block text-meta">{step.description}</span></span>
                                </button>
                            </li>)}
                        </ol></nav>
                        <p className="border-t border-border pt-4 text-meta text-muted-foreground">总体 {populationSize.toLocaleString()} 个单位<br/>{estimationType === "proportion" ? "比例估计" : "均值估计"} · {confidenceLevel}% 置信</p>
                    </aside>
                    <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto overscroll-contain" data-testid="planning-scroll-content">
                        <div key={pageKey} className="mx-auto w-full max-w-5xl px-8 py-8">
                            {renderPhase()}
                        </div>
                    </div>
                </div>
                <footer className="shrink-0 border-t border-border bg-card px-6 py-3">
                    {onRetryDraftSave && draftSaveStatus !== "idle" && <div className="mb-3 text-left"><DraftSaveStatus status={draftSaveStatus} onRetry={onRetryDraftSave}/></div>}
                    <div className="flex items-center justify-between gap-3">
                        {canGoPrev ? <Button type="button" variant="outline" onClick={goPrev} className="min-h-11"><ChevronLeft className="mr-1 h-4 w-4"/>上一步</Button> : <p className="text-meta text-muted-foreground">{phase.type === "challenge" && phase.revealed ? "建议值会随规划条件变化" : "先填写数字，或直接查看建议"}</p>}
                        {canGoNext && <Button type="button" onClick={goNext} disabled={phase.type === "decision" && !isValidPlan}
                            data-testid={phase.type === "decision" ? "immersive-sp-decision-next" : "immersive-sp-next"} className="min-h-11 whitespace-normal">
                            {nextLabel}<ChevronRight className="ml-2 h-4 w-4 shrink-0"/>
                        </Button>}
                        {phase.type === "quiz" && <p className="text-meta text-muted-foreground">自检不计分，也可以跳过</p>}
                        {phase.type === "confirm" && <Button type="button" onClick={handleConfirm} disabled={!isValidPlan || draftSaveStatus === "conflict"} data-testid="immersive-sp-confirm" className="min-h-11">保存规划并进入抽样<ChevronRight className="ml-2 h-4 w-4"/></Button>}
                    </div>
                </footer>
            </div>

            <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
                <AlertDialogContent className="z-[60]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>退出样本量规划？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {draftSaveStatus === "saved" ? "当前规划进度已保存到本机，下次打开本阶段时可以继续。" : draftSaveStatus === "error" ? "当前草稿保存失败，请取消退出并重试保存，以免丢失进度。" : "请确认草稿保存成功后再退出。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button">取消</AlertDialogCancel>
                        <AlertDialogAction type="button" onClick={confirmExit} variant="destructive">
                            确定退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>, document.body,
    );
}

// --- Sub-components ---

function ParamSummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-surface bg-muted px-3 py-2.5">
            <dt className="text-meta text-muted-foreground">{label}</dt>
            <dd className="text-label font-semibold tabular-nums text-foreground mt-0.5">{value}</dd>
        </div>
    );
}
