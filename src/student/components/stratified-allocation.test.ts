import { expect, test } from "bun:test";
import { allocateNeymanSampleCounts, allocateStratifiedSampleCounts, resolveStratumOverflow } from "./stratified-allocation";

test("Neyman preserves residual gains after a dominant stratum reaches census", () => {
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const sd of [[1, 1e-170, 2e-170], [2 ** 600, 2 ** -600, 2 ** -599], [1, 0, Number.MIN_VALUE]]) {
        for (const order of orders) {
            // Five of six units: the only unsaturated layer must have the
            // smallest SD. Its residual design variance is S_h²/18.
            expect(allocateNeymanSampleCounts({
                targetSampleSize: 5, populationCounts: [2, 2, 2], stdDevs: order.map(i => sd[i]!),
            })).toEqual(order.map(i => i === 1 ? 1 : 2));
        }
    }
    expect(allocateNeymanSampleCounts({ targetSampleSize: 4, populationCounts: [0, 2, 3], stdDevs: [0, 0, 0] })).toEqual([0, 2, 2]);
});

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

test("allocateStratifiedSampleCounts repeatedly redistributes after a tiny stratum is capped", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 50,
        rawCounts: [25, 25],
        caps: [1, 99],
    });

    expect(counts).toEqual([1, 49]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(50);
    expect(counts.every((count, index) => count <= [1, 99][index]!)).toBe(true);
});

test("allocateStratifiedSampleCounts preserves remaining weights after a dominant stratum is capped", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 100,
        rawCounts: [80, 15, 5],
        caps: [1, 100, 100],
    });

    expect(counts).toEqual([1, 74, 25]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(100);
    expect(counts[1]! / counts[2]!).toBeCloseTo(3, 1);
});

test("allocateStratifiedSampleCounts handles repeated caps without losing the target", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 100,
        rawCounts: [70, 20, 8, 2],
        caps: [5, 10, 100, 100],
    });

    expect(counts).toEqual([5, 10, 68, 17]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(100);
    expect(counts.every((count, index) => count <= [5, 10, 100, 100][index]!)).toBe(true);
});

test("allocateStratifiedSampleCounts does not freeze a lower bound before an upper cap is resolved", () => {
    expect(allocateStratifiedSampleCounts({
        targetSampleSize: 4,
        rawCounts: [3.9, 0.1],
        caps: [1, 10],
    })).toEqual([1, 3]);

    expect(allocateStratifiedSampleCounts({
        targetSampleSize: 10,
        rawCounts: [0.1, 9.9],
        caps: [100, 1],
    })).toEqual([9, 1]);

    expect(allocateStratifiedSampleCounts({
        targetSampleSize: 3,
        rawCounts: [0.733, 0.113, 0.154],
        caps: [2, 10, 7],
    })).toEqual([1, 1, 1]);
});

test("allocateStratifiedSampleCounts preserves bounds and every feasible target across varied inputs", () => {
    let state = 0x5eed1234;
    const random = () => {
        state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
        return state / 2 ** 32;
    };

    for (let layerCount = 2; layerCount <= 6; layerCount += 1) {
        for (let iteration = 0; iteration < 200; iteration += 1) {
            const targetSampleSize = 1 + Math.floor(random() * 40);
            const weights = Array.from({ length: layerCount }, () => random() < 0.1 ? 0 : random());
            const weightTotal = weights.reduce((sum, value) => sum + value, 0);
            const rawCounts = weightTotal > 0
                ? weights.map((weight) => targetSampleSize * weight / weightTotal)
                : weights;
            const caps = Array.from({ length: layerCount }, () => Math.floor(random() * 30));
            const expectedTarget = Math.min(
                caps.reduce((sum, cap) => sum + cap, 0),
                Math.max(targetSampleSize, caps.reduce((sum, cap) => sum + Math.min(cap, 1), 0)),
            );

            const counts = allocateStratifiedSampleCounts({ targetSampleSize, rawCounts, caps });
            expect(counts.reduce((sum, count) => sum + count, 0)).toBe(expectedTarget);
            expect(counts.every((count, index) => count >= Math.min(caps[index]!, 1) && count <= caps[index]!)).toBe(true);
        }
    }
});
