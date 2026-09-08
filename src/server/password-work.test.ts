import { expect, test } from "bun:test";
import { BoundedWorkQueue, DEFAULT_PASSWORD_QUEUE_LIMIT, PasswordWorkQueueFullError, mapWithConcurrency } from "./password-work";

test("slot handoff reserves capacity for an existing waiter before a new arrival", async () => {
    const queue = new BoundedWorkQueue(4, 32);
    const first = Promise.withResolvers<void>();
    const remaining = Promise.withResolvers<void>();
    const started: string[] = [];
    const jobs = [queue.run(() => first.promise), ...Array.from({ length: 3 }, () => queue.run(() => remaining.promise))];
    jobs.push(queue.run(async () => { started.push("waiting"); await remaining.promise; }));
    first.resolve();
    queueMicrotask(() => jobs.push(queue.run(async () => { started.push("new"); await remaining.promise; })));
    await Bun.sleep(0);
    expect(queue.snapshot()).toEqual({ active: 4, queued: 1 });
    expect(started).toEqual(["waiting"]);
    remaining.resolve();
    await Promise.all(jobs);
    expect(started).toEqual(["waiting", "new"]);
    expect(queue.snapshot()).toEqual({ active: 0, queued: 0 });
});

test("the default password queue admits a simultaneous class of 50", async () => {
    const queue = new BoundedWorkQueue(4, DEFAULT_PASSWORD_QUEUE_LIMIT);
    const gate = Promise.withResolvers<void>();
    const jobs = Array.from({ length: 50 }, () => queue.run(() => gate.promise));
    expect(queue.snapshot()).toEqual({ active: 4, queued: 46 });
    gate.resolve();
    await Promise.all(jobs);
    expect(queue.snapshot()).toEqual({ active: 0, queued: 0 });
});

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
