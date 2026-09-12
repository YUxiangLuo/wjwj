import { useState, useCallback, useMemo } from "react";
import { type Phase, type PhaseNavigationSnapshot, type PhaseType } from "./types";

/** Old lesson/quiz drafts keep their parameters, never their answer gates or auto-submit state. */
function restorePhase(initial?: PhaseNavigationSnapshot | null): Phase {
    const type = initial?.phase?.type;
    if (type === "confirm" || type === "quiz" || type === "launching" || type === "done") return { type: "confirm" };
    return { type: type === "reference" ? "reference" : "decision" };
}

export function usePhaseState(initial?: PhaseNavigationSnapshot | null) {
    const [phase, setPhase] = useState<Phase>(() => restorePhase(initial));
    const navigationSnapshot = useMemo(() => ({ phase }), [phase]);
    const goNext = useCallback(() => setPhase(previous => previous.type === "decision" ? { type: "confirm" } : previous), []);
    const goPrev = useCallback(() => setPhase(previous => previous.type === "done" ? previous : { type: "decision" }), []);
    const jumpTo = useCallback((type: PhaseType) => {
        if (type !== "decision" && type !== "reference") return;
        setPhase(previous => previous.type === "done" ? previous : { type });
    }, []);
    const finish = useCallback(() => setPhase(previous => previous.type === "confirm" ? { type: "done" } : previous), []);
    return { phase, navigationSnapshot, goNext, goPrev, jumpTo, finish };
}
