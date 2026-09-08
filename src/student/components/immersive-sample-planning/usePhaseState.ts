import { useState, useCallback, useMemo, useRef } from "react";
import {
    PHASE_ORDER,
    type Phase,
    type PhaseNavigationSnapshot,
    type PhaseType,
    initialPhase,
    planningStepIndex,
    PLANNING_STEPS,
} from "./types";
import { QUIZ_QUESTION_COUNT } from "./phases/QuizPhase";

function phaseIndex(type: PhaseType): number {
    return PHASE_ORDER.indexOf(type);
}

/** Percentage progress through the sample planning flow (0–100). */
function phaseProgress(phase: Phase): number {
    if (["confirm", "launching", "done"].includes(phase.type)) return 100;
    const sub = phase.type === "quiz" ? phase.questionIndex / QUIZ_QUESTION_COUNT : phase.type === "challenge" && phase.revealed ? 0.5 : 0;
    return ((planningStepIndex(phase.type) + sub) / PLANNING_STEPS.length) * 100;
}

function defaultPhaseFor(type: PhaseType): Phase {
    switch (type) {
        case "challenge": return initialPhase();
        case "precision": return { type: "precision" };
        case "factors": return { type: "factors", step: "summary" };
        case "formula": return { type: "formula", step: "z" };
        case "fpc": return { type: "fpc" };
        case "fourstep": return { type: "fourstep", scenario: "summary" };
        case "decision": return { type: "decision" };
        case "quiz": return { type: "quiz", questionIndex: 0 };
        case "confirm": return { type: "confirm" };
        case "launching": return { type: "launching" };
        case "done": return { type: "done" };
    }
}

export function usePhaseState(initial?: PhaseNavigationSnapshot | null) {
    const [phase, setPhase] = useState<Phase>(() => initial?.phase ?? initialPhase());
    const [direction, setDirection] = useState<"forward" | "backward">("forward");

    /** Last completed challenge state — used when navigating back from formula step "z" so guess is not lost. */
    const challengeSnapshotRef = useRef<{ guess: number | null; revealed: boolean }>({
        guess: initial?.challenge.guess ?? (initial?.phase.type === "challenge" ? initial.phase.guess : null),
        revealed: initial?.challenge.revealed ?? (initial?.phase.type === "challenge" ? initial.phase.revealed : false),
    });
    /** Always latest phase — avoids stale `phase.type` in jumpTo after async gaps. */
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    const progress = useMemo(() => phaseProgress(phase), [phase]);
    const navigationSnapshot = useMemo<PhaseNavigationSnapshot>(() => ({
        phase,
        challenge: phase.type === "challenge"
            ? { guess: phase.guess, revealed: phase.revealed }
            : { ...challengeSnapshotRef.current },
    }), [phase]);

    const goNext = useCallback(() => {
        setDirection("forward");
        setPhase((prev) => {
            if (prev.type === "challenge") {
                if (!prev.revealed) return prev;
                challengeSnapshotRef.current = { guess: prev.guess, revealed: prev.revealed };
                return { type: "precision" };
            }
            if (prev.type === "precision") {
                return { type: "factors", step: "summary" };
            }
            if (prev.type === "factors") {
                return { type: "fourstep", scenario: "summary" };
            }
            if (prev.type === "formula" || prev.type === "fpc") {
                return { type: "fourstep", scenario: "summary" };
            }
            if (prev.type === "fourstep") {
                return { type: "decision" };
            }
            if (prev.type === "quiz") {
                if (prev.questionIndex < QUIZ_QUESTION_COUNT - 1) return { type: "quiz", questionIndex: prev.questionIndex + 1 };
                return { type: "confirm" };
            }
            if (prev.type === "confirm" || prev.type === "launching") return prev;
            const idx = phaseIndex(prev.type);
            const nextIdx = Math.min(idx + 1, PHASE_ORDER.length - 1);
            return defaultPhaseFor(PHASE_ORDER[nextIdx]!);
        });
    }, []);

    const goPrev = useCallback(() => {
        setDirection("backward");
        setPhase((prev) => {
            if (prev.type === "precision") {
                return {
                    type: "challenge",
                    guess: challengeSnapshotRef.current.guess,
                    revealed: challengeSnapshotRef.current.revealed,
                };
            }
            if (prev.type === "factors") {
                return { type: "precision" };
            }
            if (prev.type === "formula" || prev.type === "fpc") {
                return { type: "precision" };
            }
            if (prev.type === "fourstep") {
                return { type: "factors", step: "summary" };
            }
            if (prev.type === "quiz") {
                if (prev.questionIndex > 0) return { type: "quiz", questionIndex: prev.questionIndex - 1 };
                return { type: "decision" };
            }
            if (prev.type === "confirm") return { type: "quiz", questionIndex: QUIZ_QUESTION_COUNT - 1 };
            if (prev.type === "launching") return prev;
            const idx = phaseIndex(prev.type);
            if (idx <= 0) return prev;
            return defaultPhaseFor(PHASE_ORDER[idx - 1]!);
        });
    }, []);

    const jumpTo = useCallback((type: PhaseType) => {
        const currentIdx = phaseIndex(phaseRef.current.type);
        const targetIdx = phaseIndex(type);
        setDirection(targetIdx >= currentIdx ? "forward" : "backward");
        const current = phaseRef.current;
        if (current.type === "challenge") challengeSnapshotRef.current = { guess: current.guess, revealed: current.revealed };
        setPhase(type === "challenge" ? { type: "challenge", ...challengeSnapshotRef.current } : defaultPhaseFor(type));
    }, []);

    const skipQuiz = useCallback(() => {
        setDirection("forward");
        setPhase({ type: "confirm" });
    }, []);

    return {
        phase,
        navigationSnapshot,
        setPhase,
        direction,
        progress,
        goNext,
        goPrev,
        jumpTo,
        skipQuiz,
    };
}
