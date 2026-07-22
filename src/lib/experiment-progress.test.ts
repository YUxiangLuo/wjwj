import { expect, test } from "bun:test";
import { experimentProgress } from "./experiment-progress";

test("submitted and graded experiments are complete", () => {
    expect(experimentProgress({ status: "submitted", currentStage: 4 })).toBe(100);
    expect(experimentProgress({ status: "graded", currentStage: 4 })).toBe(100);
});

test("rejected experiments remain incomplete until resubmitted", () => {
    expect(experimentProgress({ status: "rejected", currentStage: 4, stage4CompletedAt: new Date() })).toBe(75);
});

test("a finished report awaiting submission shows full stage progress", () => {
    expect(experimentProgress({ status: "in_progress", currentStage: 4, stage4CompletedAt: new Date() })).toBe(100);
});
