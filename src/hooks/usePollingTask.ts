import { useEffect, useRef } from "react";

export function usePollingTask(options: {
    enabled: boolean;
    task: () => Promise<void> | void;
    intervalMs: number;
    runImmediately?: boolean;
    runOnFocus?: boolean;
}) {
    const {
        enabled,
        task,
        intervalMs,
        runImmediately = true,
        runOnFocus = false,
    } = options;
    const taskRef = useRef(task);

    useEffect(() => {
        taskRef.current = task;
    }, [task]);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let running = false;

        const runTask = async () => {
            if (cancelled || running) return;
            running = true;
            try {
                await taskRef.current();
            } finally {
                running = false;
            }
        };

        if (runImmediately) {
            void runTask();
        }

        const onFocus = () => {
            void runTask();
        };

        if (runOnFocus) {
            window.addEventListener("focus", onFocus);
        }

        const timer = window.setInterval(() => {
            void runTask();
        }, intervalMs);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            if (runOnFocus) {
                window.removeEventListener("focus", onFocus);
            }
        };
    }, [enabled, intervalMs, runImmediately, runOnFocus]);
}
