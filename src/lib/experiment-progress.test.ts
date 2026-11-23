import { expect, test } from "bun:test";
import { experimentProgress } from "./experiment-progress";

test("submitted and graded experiments are complete", () => {
    expect(experimentProgress({ status: "submitted", currentStage: 5 })).toBe(100);
    expect(experimentProgress({ status: "graded", currentStage: 5 })).toBe(100);
});

test("rejected experiments remain incomplete until resubmitted", () => {
    expect(experimentProgress({ status: "rejected", currentStage: 5, stage5CompletedAt: new Date() })).toBe(80);
});

test("a finished report awaiting submission shows full stage progress", () => {
    expect(experimentProgress({ status: "in_progress", currentStage: 5, stage5CompletedAt: new Date() })).toBe(100);
});
