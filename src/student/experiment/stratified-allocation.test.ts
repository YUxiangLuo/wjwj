import { expect, test } from "bun:test";
import { getEqualAllocation, getProportionalAllocation, getSqrtAllocation } from "./stratified-allocation";

const layers = [
    { name: "A", count: 600, ratio: 60 },
    { name: "B", count: 300, ratio: 30 },
    { name: "C", count: 100, ratio: 10 },
];

test("proportional allocation preserves target sample size", () => {
    expect(getProportionalAllocation(layers, 100)).toEqual([60, 30, 10]);
});

test("equal allocation spreads remainder across layers", () => {
    expect(getEqualAllocation(layers, 11)).toEqual([4, 4, 3]);
});

test("sqrt allocation gives small strata more protection than pure proportional allocation", () => {
    const proportional = getProportionalAllocation(layers, 60);
    const sqrt = getSqrtAllocation(layers, 60);

    expect(sqrt.reduce((sum, value) => sum + value, 0)).toBe(60);
    expect(sqrt[2]).toBeGreaterThan(proportional[2]!);
});
