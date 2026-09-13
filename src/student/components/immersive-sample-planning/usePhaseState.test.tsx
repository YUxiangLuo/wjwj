import { beforeEach, afterEach, expect, test } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { usePhaseState } from "./usePhaseState";

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

test("planning starts with editable parameters and proceeds directly to confirmation", () => {
    const { result } = renderHook(() => usePhaseState());
    expect(result.current.phase.type).toBe("decision");
    act(() => result.current.finish());
    expect(result.current.phase.type).toBe("decision");
    act(() => result.current.goNext());
    expect(result.current.phase.type).toBe("confirm");
    act(() => result.current.goPrev());
    expect(result.current.phase.type).toBe("decision");
    act(() => result.current.goNext());
    act(() => result.current.finish());
    expect(result.current.phase.type).toBe("done");
    act(() => result.current.goPrev());
    act(() => result.current.jumpTo("reference"));
    expect(result.current.phase.type).toBe("done");
});

test("reference material is always available but cannot submit a plan", () => {
    const { result } = renderHook(() => usePhaseState());
    act(() => result.current.jumpTo("reference"));
    expect(result.current.phase.type).toBe("reference");
    act(() => result.current.goNext());
    act(() => result.current.finish());
    act(() => result.current.jumpTo("done"));
    expect(result.current.phase.type).toBe("reference");
    act(() => result.current.goPrev());
    expect(result.current.phase.type).toBe("decision");
});

for (const type of ["challenge", "precision", "factors", "formula", "fpc", "fourstep", "unknown", "quiz", "launching"]) {
    test(`unsupported page ${type} has no navigation alias`, () => {
        const { result } = renderHook(() => usePhaseState({ phase: { type } } as any));
        expect(result.current.navigationSnapshot).toEqual({ phase: { type: "decision" } });
        act(() => result.current.goNext());
        expect(result.current.phase.type).toBe("confirm");
    });
}
for (const type of ["confirm", "done"] as const) {
    test(`current ${type} state still requires explicit confirmation`, () => {
        const { result } = renderHook(() => usePhaseState({ phase: { type } }));
        expect(result.current.navigationSnapshot).toEqual({ phase: { type: "confirm" } });
    });
}

test("current decision drafts restore the settings page", () => {
    expect(renderHook(() => usePhaseState({ phase: { type: "decision" } })).result.current.phase.type).toBe("decision");
});

test("new reference drafts resume the optional reference panel", () => {
    expect(renderHook(() => usePhaseState({ phase: { type: "reference" } })).result.current.phase.type).toBe("reference");
});
