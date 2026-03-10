const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
const hangupSignal = "SIGHUP" as const;

type ManagedSignal = (typeof shutdownSignals)[number] | typeof hangupSignal;
type SignalHandler = () => void;
type SignalRegistrar = (signal: ManagedSignal, handler: SignalHandler) => void;

type ProcessSignalOptions = {
    onShutdown?: () => void | Promise<void>;
    register?: SignalRegistrar;
    exit?: () => void;
};

/** Call once per process to ignore SIGHUP and handle SIGINT/SIGTERM gracefully. */
export function registerLongRunningProcessSignals({
    onShutdown,
    register = (signal, handler) => {
        process.on(signal, handler);
    },
    exit = () => {
        process.exit(0);
    },
}: ProcessSignalOptions = {}) {
    let shuttingDown = false;

    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        const result = onShutdown?.();
        if (result && typeof result.then === "function") {
            result.then(() => exit(), () => exit());
        } else {
            exit();
        }
    };

    register(hangupSignal, () => {
        // Intentionally ignored — terminal hangups should not kill the process.
    });

    for (const signal of shutdownSignals) {
        register(signal, shutdown);
    }
}
