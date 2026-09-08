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

    test("precision → factors 概览 → fourstep summary → decision", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "precision" });
        });
        act(() => {
            result.current.goNext();
        });
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

test("从任一因素详情都能继续计算，并可返回因素概览", () => {
    const { result } = renderHook(() => usePhaseState());
    act(() => result.current.setPhase({ type: "factors", step: "non_response" }));
    act(() => result.current.goNext());
    expect(result.current.phase).toEqual({ type: "fourstep", scenario: "summary" });
    act(() => result.current.goPrev());
    expect(result.current.phase).toEqual({ type: "factors", step: "summary" });
});

test("步骤导航保留已提交的猜测，也能保存跳过猜测的进度", () => {
    const { result } = renderHook(() => usePhaseState());
    for (const guess of [40, null]) {
        act(() => result.current.setPhase({ type: "challenge", guess, revealed: true }));
        act(() => result.current.jumpTo("decision"));
        act(() => result.current.jumpTo("challenge"));
        expect(result.current.phase).toEqual({ type: "challenge", guess, revealed: true });
    }
});

test("可见六步的进度单调推进，切换因素不虚增进度", () => {
    const { result } = renderHook(() => usePhaseState());
    act(() => result.current.setPhase({ type: "challenge", guess: 40, revealed: true }));
    const progress: number[] = [];
    for (let i = 0; i < 8; i++) {
        progress.push(result.current.progress);
        act(() => result.current.goNext());
    }
    expect(progress).toEqual([...progress].sort((a,b) => a-b));
    expect(result.current.phase.type).toBe("confirm");
    expect(result.current.progress).toBe(100);
});
