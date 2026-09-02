import { expect, test } from "bun:test";
import { BoundedWorkQueue, PasswordWorkQueueFullError, mapWithConcurrency } from "./password-work";

test("bounded work queue never exceeds its concurrency and rejects excess queued work", async () => {
    const queue = new BoundedWorkQueue(2, 1);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const work = () => queue.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
    });
    const first = work();
    const second = work();
    const queued = work();
    await expect(work()).rejects.toBeInstanceOf(PasswordWorkQueueFullError);
    releases.shift()?.();
    await Bun.sleep(0);
    releases.shift()?.();
    await Bun.sleep(0);
    releases.shift()?.();
    await Promise.all([first, second, queued]);
    expect(peak).toBe(2);
});

test("mapWithConcurrency retains input order while bounding active work", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([3, 1, 2, 4], 2, async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await Bun.sleep(value);
        active -= 1;
        return value * 2;
    });
    expect(result).toEqual([6, 2, 4, 8]);
    expect(peak).toBe(2);
});
