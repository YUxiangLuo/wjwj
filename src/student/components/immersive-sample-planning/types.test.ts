import { expect, test } from "bun:test";
import { PHASE_ORDER, initialPhase } from "./types";

test("PHASE_ORDER 含完整流程且 confirm 在 quiz 之后", () => {
    expect(PHASE_ORDER).toContain("challenge");
    expect(PHASE_ORDER).toContain("decision");
    expect(PHASE_ORDER.indexOf("quiz")).toBeLessThan(PHASE_ORDER.indexOf("confirm"));
    expect(PHASE_ORDER.indexOf("confirm")).toBeLessThan(PHASE_ORDER.indexOf("launching"));
});

test("initialPhase 为未揭示 challenge", () => {
    expect(initialPhase()).toEqual({ type: "challenge", guess: null, revealed: false });
});
