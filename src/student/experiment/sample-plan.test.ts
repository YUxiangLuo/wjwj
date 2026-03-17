import { expect, test } from "bun:test";
import { calculateFinitePopulationSampleSize } from "./sample-plan";

test("basic sample size with 95% confidence and 5% margin", () => {
    const n = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThan(400);
});

test("design effect > 1 increases sample size", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withDeff = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 2,
    });
    expect(withDeff).toBe(base! * 2);
});

test("non-response rate increases sample size", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withNRR = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        nonResponseRate: 0.2,
    });
    // n / (1 - 0.2) = n / 0.8 = n * 1.25
    expect(withNRR).toBeGreaterThan(base!);
    expect(withNRR).toBeLessThanOrEqual(Math.ceil(base! / 0.8));
});

test("design effect and non-response rate combine multiplicatively", () => {
    const withBoth = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 1.5,
        nonResponseRate: 0.1,
    });
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    // Result should be close to base * 1.5 / 0.9, within ±1 due to ceil rounding
    const expected = Math.ceil(base! * 1.5 / 0.9);
    expect(Math.abs(withBoth! - expected)).toBeLessThanOrEqual(1);
});

test("returns null for invalid population size", () => {
    const result = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 0,
    });
    expect(result).toBeNull();
});

test("returns null for unsupported confidence level", () => {
    const result = calculateFinitePopulationSampleSize({
        confidenceLevel: "80",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(result).toBeNull();
});

test("deff = 1 does not change the result", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withDeff1 = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 1,
    });
    expect(withDeff1).toBe(base);
});
