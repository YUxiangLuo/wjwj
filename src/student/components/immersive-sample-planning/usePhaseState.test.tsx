import { afterEach, beforeEach, expect, test, describe } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { usePhaseState } from "./usePhaseState";

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

    test("challenge 揭示后 goNext 进入 formula:z，goPrev 回到 challenge 并保留猜测", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "challenge", guess: 42, revealed: true });
        });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "formula", step: "z" });
        act(() => {
            result.current.goPrev();
        });
        expect(result.current.phase).toEqual({ type: "challenge", guess: 42, revealed: true });
    });

    test("formula 子步骤 z→e→summary→fpc", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "formula", step: "z" });
        });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "formula", step: "e" });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "formula", step: "summary" });
        act(() => {
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "fpc" });
    });

    test("quiz 0→1→2→confirm，goPrev 从 confirm 回到 quiz:2", () => {
        const { result } = renderHook(() => usePhaseState());
        act(() => {
            result.current.setPhase({ type: "quiz", questionIndex: 0 });
        });
        act(() => {
            result.current.goNext();
            result.current.goNext();
            result.current.goNext();
        });
        expect(result.current.phase).toEqual({ type: "confirm" });
        act(() => {
            result.current.goPrev();
        });
        expect(result.current.phase).toEqual({ type: "quiz", questionIndex: 2 });
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
});
