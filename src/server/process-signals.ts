const signalExitCodes: Record<string, number> = {
    SIGINT: 130,
    SIGTERM: 143,
};

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
const hangupSignal = "SIGHUP" as const;

type ManagedSignal = (typeof shutdownSignals)[number] | typeof hangupSignal;
type SignalHandler = () => void;
type SignalRegistrar = (signal: ManagedSignal, handler: SignalHandler) => void;

type ProcessSignalOptions = {
    onShutdown?: () => void | Promise<void>;
    register?: SignalRegistrar;
    exit?: (code: number) => void;
};

/** Call once per process to ignore SIGHUP and handle SIGINT/SIGTERM gracefully. */
export function registerLongRunningProcessSignals({
    onShutdown,
    register = (signal, handler) => {
        process.on(signal, handler);
    },
    exit = (code: number) => {
        process.exit(code);
    },
}: ProcessSignalOptions = {}) {
    let shuttingDown = false;

    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        const code = signalExitCodes[signal] ?? 1;
        const result = onShutdown?.();
        if (result && typeof result.then === "function") {
            result.then(
                () => exit(code),
                (error) => {
                    console.error("Error during shutdown:", error);
                    exit(code);
                },
            );
        } else {
            exit(code);
        }
    };

    register(hangupSignal, () => {
        // Intentionally ignored — terminal hangups should not kill the process.
    });

    for (const signal of shutdownSignals) {
        register(signal, () => shutdown(signal));
    }
}
