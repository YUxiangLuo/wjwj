import { expect, test } from "bun:test";
import { allocateStratifiedSampleCounts } from "./stratified-allocation";

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

test("allocateStratifiedSampleCounts preserves the target total for equal allocation", () => {
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: 10,
        rawCounts: [10 / 3, 10 / 3, 10 / 3],
        caps: [100, 100, 100],
    });

    expect(counts).toEqual([4, 3, 3]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);
});
