import { expect, mock, test } from "bun:test";
import { createSingleFlight } from "./single-flight";

test("createSingleFlight shares a single promise for concurrent calls", async () => {
    let resolveTask: ((value: number) => void) | undefined;
    const task = mock(
        () =>
            new Promise<number>((resolve) => {
                resolveTask = resolve;
            }),
    );
    const run = createSingleFlight(task);

    const first = run();
    const second = run();

    expect(task).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    resolveTask?.(42);

    await expect(first).resolves.toBe(42);
});

test("createSingleFlight allows a new call after the previous one settles", async () => {
    let calls = 0;
    const run = createSingleFlight(async () => {
        calls += 1;
        return calls;
    });

    await expect(run()).resolves.toBe(1);
    await expect(run()).resolves.toBe(2);
});
