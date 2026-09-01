import { afterEach, beforeEach, expect, test, describe } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { usePhaseState } from "./usePhaseState";
import { QUIZ_QUESTION_COUNT } from "./phases/QuizPhase";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

describe("usePhaseState", () => {
    test("初始为 challenge，未揭示时 goNext 不前进", () => {
        const { result } = renderHook(() => usePhaseState());
        expect(result.current.phase).toEqual({ type: "challenge", guess: null, revealed: false });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase.type).toBe("challenge");
    });

    test("challenge 揭示后 goNext 进入 precision，goPrev 回到 challenge 并保留猜测", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "challenge", guess: 42, revealed: true });
        });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "precision" });
        act(() => {
            result.current.goPrev();
        });
        expect(result.current.phase).toEqual({ type: "challenge", guess: 42, revealed: true });
    });

    test("precision → factors 六步走 → fourstep summary → decision", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "precision" });
        });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "factors", step: "error_tolerance" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "subpopulation" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "variability" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "design_effect" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "non_response" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "cost_balance" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "summary" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "fourstep", scenario: "summary" });
        act(() => { result.current.goNext(); });
        expect(result.current.phase).toEqual({ type: "decision" });
        act(() => { result.current.goPrev(); });
        expect(result.current.phase).toEqual({ type: "fourstep", scenario: "summary" });
        act(() => { result.current.goPrev(); });
        expect(result.current.phase).toEqual({ type: "factors", step: "summary" });
    });

    test("quiz 0→...→last→confirm，goPrev 从 confirm 回到 last quiz", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "quiz", questionIndex: 0 });
        });
        for (let i = 0; i < QUIZ_QUESTION_COUNT; i++) {
            act(() => { result.current.goNext(); });
        }
        expect(result.current.phase).toEqual({ type: "confirm" });
        act(() => {
            result.current.goPrev();
        });
        expect(result.current.phase).toEqual({ type: "quiz", questionIndex: QUIZ_QUESTION_COUNT - 1 });
    });

    test("skipQuiz 直接进入 confirm", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "quiz", questionIndex: 0 });
        });
        act(() => {
            result.current.skipQuiz();
        });
        expect(result.current.phase).toEqual({ type: "confirm" });
    });

    test("jumpTo 重置为目标阶段默认状态", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "quiz", questionIndex: 2 });
        });
        act(() => {
            result.current.jumpTo("decision");
        });
        expect(result.current.phase).toEqual({ type: "decision" });
    });

    test("restores both the current phase and the completed challenge snapshot", () => {
        const { result } = renderHook(() => usePhaseState({
            phase: { type: "precision" },
            challenge: { guess: 64, revealed: true },
        }));

        expect(result.current.phase).toEqual({ type: "precision" });
        act(() => result.current.goPrev());
        expect(result.current.phase).toEqual({ type: "challenge", guess: 64, revealed: true });
    });
});

    test("factors 阶段按六因素顺序推进：误差限→子总体→变异→设计效应→无回答率→成本→汇总", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "factors", step: "error_tolerance" });
        });
        const expected = ["subpopulation", "variability", "design_effect", "non_response", "cost_balance", "summary"] as const;
        for (const step of expected) {
            act(() => { result.current.goNext(); });
            expect(result.current.phase).toEqual({ type: "factors", step });
        }
        act(() => { result.current.goNext(); });
        expect(result.current.phase.type).not.toBe("factors");
    });
