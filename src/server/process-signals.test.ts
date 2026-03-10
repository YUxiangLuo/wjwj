import { expect, test } from "bun:test";
import { registerLongRunningProcessSignals } from "./process-signals";

test("registerLongRunningProcessSignals ignores SIGHUP", () => {
    const handlers = new Map<string, () => void>();
    const exitCodes: number[] = [];
    let shutdownCalls = 0;
    let hangupCalls = 0;

    registerLongRunningProcessSignals({
        onShutdown: () => {
            shutdownCalls += 1;
        },
        onHangup: () => {
            hangupCalls += 1;
        },
        register: (signal, handler) => {
            handlers.set(signal, handler);
        },
        exit: (code) => {
            exitCodes.push(code ?? 0);
        },
    });

    handlers.get("SIGHUP")?.();

    expect([...handlers.keys()].sort()).toEqual(["SIGHUP", "SIGINT", "SIGTERM"]);
    expect(hangupCalls).toBe(1);
    expect(shutdownCalls).toBe(0);
    expect(exitCodes).toEqual([]);
});

test("registerLongRunningProcessSignals shuts down once on termination signals", () => {
    const handlers = new Map<string, () => void>();
    const exitCodes: number[] = [];
    let shutdownCalls = 0;

    registerLongRunningProcessSignals({
        onShutdown: () => {
            shutdownCalls += 1;
        },
        register: (signal, handler) => {
            handlers.set(signal, handler);
        },
        exit: (code) => {
            exitCodes.push(code ?? 0);
        },
    });

    handlers.get("SIGINT")?.();
    handlers.get("SIGTERM")?.();

    expect(shutdownCalls).toBe(1);
    expect(exitCodes).toEqual([0]);
});
