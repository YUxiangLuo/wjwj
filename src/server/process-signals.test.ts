import { expect, test } from "bun:test";
import { registerLongRunningProcessSignals } from "./process-signals";

test("registerLongRunningProcessSignals ignores SIGHUP", () => {
    const handlers = new Map<string, () => void>();
    let exitCalled = false;
    let shutdownCalls = 0;

    registerLongRunningProcessSignals({
        onShutdown: () => {
            shutdownCalls += 1;
        },
        register: (signal, handler) => {
            handlers.set(signal, handler);
        },
        exit: () => {
            exitCalled = true;
        },
    });

    handlers.get("SIGHUP")?.();

    expect([...handlers.keys()].sort()).toEqual(["SIGHUP", "SIGINT", "SIGTERM"]);
    expect(shutdownCalls).toBe(0);
    expect(exitCalled).toBe(false);
});

test("registerLongRunningProcessSignals shuts down once on termination signals", () => {
    const handlers = new Map<string, () => void>();
    let exitCount = 0;
    let shutdownCalls = 0;

    registerLongRunningProcessSignals({
        onShutdown: () => {
            shutdownCalls += 1;
        },
        register: (signal, handler) => {
            handlers.set(signal, handler);
        },
        exit: () => {
            exitCount += 1;
        },
    });

    handlers.get("SIGINT")?.();
    handlers.get("SIGTERM")?.();

    expect(shutdownCalls).toBe(1);
    expect(exitCount).toBe(1);
});

test("registerLongRunningProcessSignals awaits async onShutdown before exit", async () => {
    const handlers = new Map<string, () => void>();
    let exitCount = 0;
    let cleanupDone = false;

    registerLongRunningProcessSignals({
        onShutdown: async () => {
            await new Promise((r) => setTimeout(r, 10));
            cleanupDone = true;
        },
        register: (signal, handler) => {
            handlers.set(signal, handler);
        },
        exit: () => {
            exitCount += 1;
        },
    });

    handlers.get("SIGTERM")?.();

    // exit is deferred until the async cleanup finishes
    expect(exitCount).toBe(0);
    expect(cleanupDone).toBe(false);

    await new Promise((r) => setTimeout(r, 50));

    expect(cleanupDone).toBe(true);
    expect(exitCount).toBe(1);
});
