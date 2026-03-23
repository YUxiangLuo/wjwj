import { useState, useCallback, useMemo, useRef } from "react";
import { PHASE_ORDER, type Phase, type PhaseType, initialPhase } from "./types";

function phaseIndex(type: PhaseType): number {
    return PHASE_ORDER.indexOf(type);
}

/** Percentage progress through the sample planning flow (0–100). */
function phaseProgress(phase: Phase): number {
    const total = PHASE_ORDER.length; // includes "done"
    const base = phaseIndex(phase.type);
    let sub = 0;
    if (phase.type === "formula") {
        sub = phase.step === "z" ? 0 : phase.step === "e" ? 0.33 : 0.66;
    } else if (phase.type === "realworld") {
        sub = phase.scenario === "deff" ? 0 : phase.scenario === "nrr" ? 0.33 : 0.66;
    } else if (phase.type === "quiz") {
        sub = Math.min(phase.questionIndex / 3, 0.99);
    }
    return Math.min(100, ((base + sub) / (total - 1)) * 100);
}

function defaultPhaseFor(type: PhaseType): Phase {
    switch (type) {
        case "challenge": return initialPhase();
        case "formula": return { type: "formula", step: "z" };
        case "fpc": return { type: "fpc" };
        case "realworld": return { type: "realworld", scenario: "deff" };
        case "decision": return { type: "decision" };
        case "quiz": return { type: "quiz", questionIndex: 0 };
        case "confirm": return { type: "confirm" };
        case "launching": return { type: "launching" };
        case "done": return { type: "done" };
    }
}

export function usePhaseState() {
    const [phase, setPhase] = useState<Phase>(initialPhase);
    const [direction, setDirection] = useState<"forward" | "backward">("forward");

    /** Last completed challenge state — used when navigating back from formula step "z" so guess is not lost. */
    const challengeSnapshotRef = useRef<{ guess: number | null; revealed: boolean }>({
        guess: null,
        revealed: false,
    });
    /** Always latest phase — avoids stale `phase.type` in jumpTo after async gaps. */
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    const progress = useMemo(() => phaseProgress(phase), [phase]);

    const goNext = useCallback(() => {
        setDirection("forward");
        setPhase((prev) => {
            // Sub-step navigation within phases
            if (prev.type === "challenge") {
                if (!prev.revealed) return prev; // must reveal first
                challengeSnapshotRef.current = { guess: prev.guess, revealed: prev.revealed };
                return { type: "formula", step: "z" };
            }
            if (prev.type === "formula") {
                if (prev.step === "z") return { type: "formula", step: "e" };
                if (prev.step === "e") return { type: "formula", step: "summary" };
                return { type: "fpc" };
            }
            if (prev.type === "realworld") {
                if (prev.scenario === "deff") return { type: "realworld", scenario: "nrr" };
                if (prev.scenario === "nrr") return { type: "realworld", scenario: "summary" };
                return { type: "decision" };
            }
            if (prev.type === "quiz") {
                if (prev.questionIndex < 2) return { type: "quiz", questionIndex: prev.questionIndex + 1 };
                return { type: "confirm" };
            }
            // confirm → launching is handled externally (after save succeeds)
            // launching → done is handled externally (after animation completes)
            if (prev.type === "confirm" || prev.type === "launching") return prev;
            // Simple phase advancement
            const idx = phaseIndex(prev.type);
            const nextIdx = Math.min(idx + 1, PHASE_ORDER.length - 1);
            return defaultPhaseFor(PHASE_ORDER[nextIdx]!);
        });
    }, []);

    const goPrev = useCallback(() => {
        setDirection("backward");
        setPhase((prev) => {
            // Sub-step navigation backward
            if (prev.type === "formula") {
                if (prev.step === "summary") return { type: "formula", step: "e" };
                if (prev.step === "e") return { type: "formula", step: "z" };
                return {
                    type: "challenge",
                    guess: challengeSnapshotRef.current.guess,
                    revealed: challengeSnapshotRef.current.revealed,
                };
            }
            if (prev.type === "realworld") {
                if (prev.scenario === "summary") return { type: "realworld", scenario: "nrr" };
                if (prev.scenario === "nrr") return { type: "realworld", scenario: "deff" };
                return { type: "fpc" };
            }
            if (prev.type === "quiz") {
                if (prev.questionIndex > 0) return { type: "quiz", questionIndex: prev.questionIndex - 1 };
                return { type: "decision" };
            }
            // confirm → back to last quiz question; launching is locked
            if (prev.type === "confirm") return { type: "quiz", questionIndex: 2 };
            if (prev.type === "launching") return prev;
            // Simple phase go-back
            const idx = phaseIndex(prev.type);
            if (idx <= 0) return prev;
            return defaultPhaseFor(PHASE_ORDER[idx - 1]!);
        });
    }, []);

    const jumpTo = useCallback((type: PhaseType) => {
        const currentIdx = phaseIndex(phaseRef.current.type);
        const targetIdx = phaseIndex(type);
        setDirection(targetIdx >= currentIdx ? "forward" : "backward");
        setPhase(defaultPhaseFor(type));
    }, []);

    const skipQuiz = useCallback(() => {
        setDirection("forward");
        setPhase({ type: "confirm" });
    }, []);

    return {
        phase,
        setPhase,
        direction,
        progress,
        goNext,
        goPrev,
        jumpTo,
        skipQuiz,
    };
}
