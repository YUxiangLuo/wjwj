import { expect, test } from "bun:test";
import { allocateStratifiedSampleCounts, resolveStratumOverflow } from "./stratified-allocation";

test("allocateStratifiedSampleCounts fills the rounding remainder for proportional defaults", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 420,
        rawCounts: [
            420 * (5155 / 10000),
            420 * (4845 / 10000),
        ],
        caps: [5155, 4845],
    });

    expect(counts).toEqual([217, 203]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(420);
});

test("resolveStratumOverflow redistributes leftover sample after capping overflowing strata", () => {
    const resolved = resolveStratumOverflow([
        { name: "Small", populationSize: 10, sampleSize: 25 },
        { name: "Large", populationSize: 90, sampleSize: 15 },
    ]);

    expect(resolved.hasOverAllocation).toBe(true);
    expect(resolved.overAllocatedLayers).toEqual(["Small"]);
    expect(resolved.allocation).toEqual([
        { name: "Small", count: 10, sampleCount: 10 },
        { name: "Large", count: 90, sampleCount: 30 },
    ]);
    expect(resolved.adjustedTotalSampleSize).toBe(40);
});

test("resolveStratumOverflow keeps the original counts when nothing overflows", () => {
    const resolved = resolveStratumOverflow([
        { name: "A", populationSize: 50, sampleSize: 20 },
        { name: "B", populationSize: 50, sampleSize: 20 },
    ]);

    expect(resolved.hasOverAllocation).toBe(false);
    expect(resolved.allocation.map((layer) => layer.sampleCount)).toEqual([20, 20]);
});

test("allocateStratifiedSampleCounts preserves the target total for equal allocation", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 10,
        rawCounts: [10 / 3, 10 / 3, 10 / 3],
        caps: [100, 100, 100],
    });

    expect(counts).toEqual([4, 3, 3]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);
});
