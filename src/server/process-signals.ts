const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
const hangupSignal = "SIGHUP" as const;

type ManagedSignal = (typeof shutdownSignals)[number] | typeof hangupSignal;
type SignalHandler = () => void;
type SignalRegistrar = (signal: ManagedSignal, handler: SignalHandler) => void;

type ProcessSignalOptions = {
    onShutdown?: () => void;
    onHangup?: () => void;
    register?: SignalRegistrar;
    exit?: (code?: number) => void;
};

export function registerLongRunningProcessSignals({
    onShutdown,
    onHangup,
    register = (signal, handler) => {
        process.on(signal, handler);
    },
    exit = (code) => {
        process.exit(code);
    },
}: ProcessSignalOptions = {}) {
    let shuttingDown = false;

    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        onShutdown?.();
        exit(0);
    };

    register(hangupSignal, () => {
        onHangup?.();
    });

    for (const signal of shutdownSignals) {
        register(signal, shutdown);
    }
}
