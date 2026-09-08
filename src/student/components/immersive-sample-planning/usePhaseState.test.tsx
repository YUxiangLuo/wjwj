import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, renderHook, cleanup } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { usePhaseState } from "./usePhaseState";
import { FACTOR_ORDER, QUIZ_CHECKS } from "./learning";
import type { Phase } from "./types";

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

function start() {
    return renderHook(() => usePhaseState({ phase: { type: "precision" }, challenge: { guess: 40, revealed: true } }));
}

test("unrevealed challenge, forward navigation and terminal jumps cannot skip learning", () => {
    const { result } = renderHook(() => usePhaseState());
    act(() => { result.current.goNext(); result.current.jumpTo("decision"); result.current.jumpTo("confirm"); result.current.finish(); });
    expect(result.current.phase).toEqual({ type: "challenge", guess: null, revealed: false });
    act(() => result.current.setPhase({ type: "challenge", guess: 42, revealed: true }));
    act(() => result.current.goNext());
    expect(result.current.phase.type).toBe("precision");
    act(() => result.current.goPrev());
    expect(result.current.phase).toEqual({ type: "challenge", guess: 42, revealed: true });
});

test("all six factors and the calculation must be understood before the decision and quiz unlock", () => {
    const { result } = start();
    act(() => { result.current.goNext(); result.current.completeCheck("calculation"); result.current.jumpTo("decision"); });
    expect(result.current.phase.type).toBe("precision");
    expect(result.current.learning.completed).toEqual([]);
    act(() => result.current.completeCheck("precision"));
    act(() => result.current.goNext());
    for (const id of FACTOR_ORDER) {
        expect(result.current.phase).toEqual({ type: "factors", step: id });
        act(() => {
            result.current.goNext();
            result.current.setPhase({ type: "factors", step: "summary" });
            result.current.jumpTo("fourstep");
        });
        expect(result.current.phase).toEqual({ type: "factors", step: id });
        act(() => result.current.completeCheck(id));
        act(() => result.current.goNext());
    }
    expect(result.current.phase).toEqual({ type: "factors", step: "summary" });
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.phase.type).toBe("fourstep");
    act(() => result.current.completeCheck("calculation"));
    act(() => result.current.goNext());
    expect(result.current.phase.type).toBe("decision");
    act(() => result.current.jumpTo("quiz"));
    expect(result.current.phase.type).toBe("decision");
    act(() => result.current.goNext());
    expect(result.current.phase).toEqual({ type: "quiz", questionIndex: 0 });
    for (const [index, id] of QUIZ_CHECKS.entries()) {
        act(() => { result.current.goNext(); result.current.jumpTo("confirm"); result.current.finish(); });
        expect(result.current.phase).toEqual({ type: "quiz", questionIndex: index });
        act(() => result.current.completeCheck(id));
        act(() => result.current.goNext());
    }
    expect(result.current.phase.type).toBe("confirm");
    expect(result.current.progress).toBe(100);
    act(() => result.current.jumpTo("decision"));
    act(() => result.current.goNext());
    expect(result.current.phase.type).toBe("confirm");
    act(() => result.current.finish());
    expect(result.current.phase.type).toBe("done");
});

test("resuming and revisiting preserve mastered factors and do not reset progress", () => {
    const { result, unmount } = renderHook(() => usePhaseState({
        phase: { type: "factors", step: "subpopulation" }, challenge: { guess: null, revealed: true },
        learning: { version: 1, completed: ["precision", "error_tolerance"], decisionReviewed: false },
    }));
    const saved = result.current.navigationSnapshot;
    unmount();
    const resumed = renderHook(() => usePhaseState(saved)).result;
    expect(resumed.current.phase).toEqual({ type: "factors", step: "subpopulation" });
    expect(resumed.current.canGoNext).toBe(false);
    const progress = resumed.current.progress;
    act(() => resumed.current.goPrev());
    expect(resumed.current.phase).toEqual({ type: "factors", step: "error_tolerance" });
    expect(resumed.current.canGoNext).toBe(true);
    expect(resumed.current.progress).toBe(progress);
    act(() => resumed.current.goNext());
    expect(resumed.current.phase).toEqual({ type: "factors", step: "subpopulation" });
    act(() => resumed.current.jumpTo("precision"));
    act(() => resumed.current.jumpTo("factors"));
    expect(resumed.current.phase).toEqual({ type: "factors", step: "subpopulation" });
});

test.each<Phase>([
    { type: "decision" }, { type: "quiz", questionIndex: 2 }, { type: "confirm" },
    { type: "launching" }, { type: "done" }, { type: "fpc" },
])("legacy $type draft resumes the first unfinished lesson rather than implying completion", phase => {
    const { result } = renderHook(() => usePhaseState({ phase, challenge: { guess: 40, revealed: true } }));
    expect(result.current.phase.type).toBe("precision");
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.navigationSnapshot.challenge.guess).toBe(40);
    act(() => result.current.finish());
    expect(result.current.phase.type).toBe("precision");
});

test("a completed terminal draft restores a review screen and still needs explicit confirmation", () => {
    const { result } = renderHook(() => usePhaseState({
        phase: { type: "done" }, challenge: { guess: null, revealed: true },
        learning: { version: 1, completed: ["precision", ...FACTOR_ORDER, "calculation", ...QUIZ_CHECKS], decisionReviewed: true },
    }));
    expect(result.current.phase.type).toBe("confirm");
    act(() => result.current.finish());
    expect(result.current.phase.type).toBe("done");
});
