import { useState, useCallback, type SetStateAction } from "react";
import { type Phase, type PhaseNavigationSnapshot, type PhaseType, initialPhase, planningStepIndex } from "./types";
import { FACTOR_ORDER, QUIZ_CHECKS, phaseLearningCheck, restoreLearningProgress, type LearningCheckId, type LearningProgress } from "./learning";

interface NavigationState extends PhaseNavigationSnapshot {
    learning: LearningProgress;
}

function reachableStep({ challenge, learning }: NavigationState): number {
    if (!challenge.revealed) return 0;
    if (!learning.completed.includes("precision")) return 1;
    if (!FACTOR_ORDER.every(id => learning.completed.includes(id))) return 2;
    if (!learning.completed.includes("calculation")) return 3;
    return learning.decisionReviewed ? 5 : 4;
}

function firstFactor(state: NavigationState) {
    return FACTOR_ORDER.find(id => !state.learning.completed.includes(id)) ?? "summary";
}

function firstQuiz(state: NavigationState) {
    const index = QUIZ_CHECKS.findIndex(id => !state.learning.completed.includes(id));
    return index < 0 ? QUIZ_CHECKS.length - 1 : index;
}

function hasFinishedLearning(state: NavigationState) {
    return reachableStep(state) === 5 && QUIZ_CHECKS.every(id => state.learning.completed.includes(id));
}

function phaseForStep(step: number, state: NavigationState): Phase {
    if (step === 0) return { type: "challenge", ...state.challenge };
    if (step === 1) return { type: "precision" };
    if (step === 2) return { type: "factors", step: firstFactor(state) };
    if (step === 3) return { type: "fourstep", scenario: "summary" };
    if (step === 4) return { type: "decision" };
    return { type: "quiz", questionIndex: firstQuiz(state) };
}

/** Legacy drafts retain their parameters, but a late page is not evidence of completed learning. */
function restoreNavigation(initial?: PhaseNavigationSnapshot | null): NavigationState {
    const state: NavigationState = {
        phase: initial?.phase ?? initialPhase(),
        challenge: initial?.phase.type === "challenge"
            ? { guess: initial.phase.guess, revealed: initial.phase.revealed }
            : initial?.challenge ?? { guess: null, revealed: false },
        learning: restoreLearningProgress(initial?.learning),
    };
    const limit = reachableStep(state);
    if (planningStepIndex(state.phase.type) > limit) state.phase = phaseForStep(limit, state);
    if (state.phase.type === "formula" || state.phase.type === "fpc") state.phase = { type: "fourstep", scenario: "summary" };
    if (state.phase.type === "factors") {
        const first = firstFactor(state);
        if (first !== "summary" && (state.phase.step === "summary" || FACTOR_ORDER.indexOf(state.phase.step) > FACTOR_ORDER.indexOf(first))) {
            state.phase = { type: "factors", step: first };
        }
    }
    if (state.phase.type === "quiz") {
        state.phase = { type: "quiz", questionIndex: Math.max(0, Math.min(state.phase.questionIndex, firstQuiz(state))) };
    }
    if (["confirm", "launching", "done"].includes(state.phase.type)) {
        state.phase = hasFinishedLearning(state) ? { type: "confirm" } : phaseForStep(limit, state);
    }
    return state;
}

function canAdvance(state: NavigationState) {
    const { phase, learning } = state;
    if (phase.type === "challenge") return phase.revealed;
    const check = phaseLearningCheck(phase);
    if (check) return learning.completed.includes(check);
    if (phase.type === "factors") return FACTOR_ORDER.every(id => learning.completed.includes(id));
    return phase.type === "decision";
}

export function usePhaseState(initial?: PhaseNavigationSnapshot | null) {
    const [state, setState] = useState(() => restoreNavigation(initial));
    const [direction, setDirection] = useState<"forward" | "backward">("forward");
    const { phase, learning } = state;

    // Local edits cannot move the wizard into another page or unlock an unfinished factor.
    const setPhase = useCallback((action: SetStateAction<Phase>) => setState(previous => {
        const next = typeof action === "function" ? action(previous.phase) : action;
        if (next.type !== previous.phase.type) return previous;
        if (next.type === "challenge") return { ...previous, phase: next, challenge: { guess: next.guess, revealed: next.revealed } };
        if (next.type === "factors") {
            const first = firstFactor(previous);
            if (first !== "summary" && (next.step === "summary" || FACTOR_ORDER.indexOf(next.step) > FACTOR_ORDER.indexOf(first))) return previous;
            return { ...previous, phase: next };
        }
        return previous;
    }), []);

    const completeCheck = useCallback((id: LearningCheckId) => setState(previous => {
        if (phaseLearningCheck(previous.phase) !== id || previous.learning.completed.includes(id)) return previous;
        return { ...previous, learning: { ...previous.learning, completed: [...previous.learning.completed, id] } };
    }), []);

    const goNext = useCallback(() => {
        setDirection("forward");
        setState(previous => {
            if (!canAdvance(previous)) return previous;
            const current = previous.phase;
            let next: Phase;
            if (current.type === "challenge") next = { type: "precision" };
            else if (current.type === "precision") next = { type: "factors", step: firstFactor(previous) };
            else if (current.type === "factors") {
                if (current.step === "summary") next = { type: "fourstep", scenario: "summary" };
                else next = { type: "factors", step: FACTOR_ORDER[FACTOR_ORDER.indexOf(current.step) + 1] ?? "summary" };
            } else if (current.type === "fourstep") next = { type: "decision" };
            else if (current.type === "decision") {
                const reviewed = { ...previous, learning: { ...previous.learning, decisionReviewed: true } };
                return { ...reviewed, phase: hasFinishedLearning(reviewed) ? { type: "confirm" } : { type: "quiz", questionIndex: firstQuiz(reviewed) } };
            } else if (current.type === "quiz") {
                next = current.questionIndex < QUIZ_CHECKS.length - 1
                    ? { type: "quiz", questionIndex: current.questionIndex + 1 }
                    : { type: "confirm" };
            } else return previous;
            return { ...previous, phase: next };
        });
    }, []);

    const goPrev = useCallback(() => {
        setDirection("backward");
        setState(previous => {
            const current = previous.phase;
            let next: Phase;
            if (current.type === "precision") next = { type: "challenge", ...previous.challenge };
            else if (current.type === "factors") {
                const index = current.step === "summary" ? FACTOR_ORDER.length : FACTOR_ORDER.indexOf(current.step);
                next = index > 0 ? { type: "factors", step: FACTOR_ORDER[index - 1]! } : { type: "precision" };
            } else if (current.type === "fourstep") next = { type: "factors", step: "summary" };
            else if (current.type === "decision") next = { type: "fourstep", scenario: "summary" };
            else if (current.type === "quiz") next = current.questionIndex > 0 ? { type: "quiz", questionIndex: current.questionIndex - 1 } : { type: "decision" };
            else if (current.type === "confirm") next = { type: "quiz", questionIndex: QUIZ_CHECKS.length - 1 };
            else return previous;
            return { ...previous, phase: next };
        });
    }, []);

    const jumpTo = useCallback((type: PhaseType) => {
        setState(previous => {
            if (["confirm", "launching", "done"].includes(type) || planningStepIndex(type) > reachableStep(previous)) return previous;
            return { ...previous, phase: phaseForStep(planningStepIndex(type), previous) };
        });
    }, []);

    const finish = useCallback(() => setState(previous => previous.phase.type === "confirm" && hasFinishedLearning(previous)
        ? { ...previous, phase: { type: "done" } } : previous), []);

    const completed = learning.completed;
    const progress = ((state.challenge.revealed ? 1 : 0)
        + Number(completed.includes("precision"))
        + FACTOR_ORDER.filter(id => completed.includes(id)).length / FACTOR_ORDER.length
        + Number(completed.includes("calculation"))
        + Number(learning.decisionReviewed)
        + QUIZ_CHECKS.filter(id => completed.includes(id)).length / QUIZ_CHECKS.length) / 6 * 100;

    return { phase, navigationSnapshot: state, learning, setPhase, direction, progress,
        goNext, goPrev, jumpTo, finish, completeCheck, canGoNext: canAdvance(state), reachableStep: reachableStep(state) };
}
