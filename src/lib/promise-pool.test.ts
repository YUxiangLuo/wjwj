import { expect, test } from "bun:test";
import { mapWithConcurrency } from "./promise-pool";

test("mapWithConcurrency preserves order and respects the concurrency ceiling", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
});
