import { expect, test } from "bun:test";
import { PHASE_ORDER, initialPhase } from "./types";

test("PHASE_ORDER 含完整流程且顺序正确", () => {
    expect(PHASE_ORDER).toContain("challenge");
    expect(PHASE_ORDER).toContain("precision");
    expect(PHASE_ORDER).toContain("factors");
    expect(PHASE_ORDER).toContain("formula");
    expect(PHASE_ORDER).toContain("fpc");
    expect(PHASE_ORDER).toContain("fourstep");
    expect(PHASE_ORDER).toContain("decision");
    expect(PHASE_ORDER).toContain("quiz");
    expect(PHASE_ORDER).toContain("confirm");
    expect(PHASE_ORDER.indexOf("precision")).toBeLessThan(PHASE_ORDER.indexOf("factors"));
    expect(PHASE_ORDER.indexOf("factors")).toBeLessThan(PHASE_ORDER.indexOf("formula"));
    expect(PHASE_ORDER.indexOf("quiz")).toBeLessThan(PHASE_ORDER.indexOf("confirm"));
    expect(PHASE_ORDER.indexOf("confirm")).toBeLessThan(PHASE_ORDER.indexOf("launching"));
});

test("PHASE_ORDER 不再含 realworld", () => {
    expect(PHASE_ORDER).not.toContain("realworld");
});

test("initialPhase 为未揭示 challenge", () => {
    expect(initialPhase()).toEqual({ type: "challenge", guess: null, revealed: false });
});
