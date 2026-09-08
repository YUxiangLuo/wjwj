import { expect, test } from "bun:test";
import { calculatePlannedPrecision, formatPlanningError } from "./planned-precision";
const params = { populationSize: 160, estimationType: "proportion" as const, confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0 };

test("160-unit planning evaluates the chosen count and the 113/114 precision boundary", () => {
    expect(calculatePlannedPrecision(params, 40)?.marginOfError).toBeCloseTo(0.13461335266971524, 12);
    expect(calculatePlannedPrecision(params, 80)?.meetsTarget).toBe(false);
    expect(calculatePlannedPrecision(params, 113)?.meetsTarget).toBe(false);
    expect(calculatePlannedPrecision(params, 114)?.meetsTarget).toBe(true);
    expect(formatPlanningError(calculatePlannedPrecision(params, 80)!.marginOfError, "proportion")).toBe("±7.77 个百分点");
});

test("whole-population invitations retain uncertainty when half do not respond", () => {
    const planned = calculatePlannedPrecision({...params, nonResponseRate: 0.5}, 160)!;
    expect(planned.expectedCompleted).toBe(80);
    expect(planned.marginOfError).toBeCloseTo(0.07771905540037813, 12);
    expect(planned.meetsTarget).toBe(false);
    expect(calculatePlannedPrecision(params, 160)?.marginOfError).toBe(0);
});

test("mean estimates preserve their units and reject unavailable variance", () => {
    const mean = {...params, estimationType: "mean" as const, populationVariance: 100, marginOfError: 2};
    expect(calculatePlannedPrecision(mean, 80)?.marginOfError).toBeCloseTo(1.5543811080075625, 12);
    expect(formatPlanningError(1.554381108, "mean")).toBe("±1.55");
    expect(calculatePlannedPrecision({...mean, populationVariance: undefined}, 80)).toBeNull();
    expect(formatPlanningError(2.63e-6, "mean")).toBe("±2.630e-6");
});

test("invalid counts and parameters never produce a reassuring precision status", () => {
    for (const n of [0, -1, 160.5, 161, NaN, Infinity]) expect(calculatePlannedPrecision(params, n)).toBeNull();
    for (const overrides of [{marginOfError: 0}, {marginOfError: -5}, {marginOfError: 0.5}, {confidenceLevel: "80"}, {nonResponseRate: 1}, {designEffect: Infinity}]) {
        expect(calculatePlannedPrecision({...params, ...overrides}, 114)).toBeNull();
    }
});
