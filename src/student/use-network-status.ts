import { useEffect, useState } from "react";

interface UseNetworkStatusOptions {
    offlineMessage: string;
    autoDismissMs?: number;
    pauseAutoDismiss?: boolean;
}

export function useNetworkStatus({
    offlineMessage,
    autoDismissMs = 5000,
    pauseAutoDismiss = false,
}: UseNetworkStatusOptions) {
    const [isOnline, setIsOnline] = useState(() => (
        typeof navigator === "undefined" ? true : navigator.onLine
    ));
    const [networkNotice, setNetworkNotice] = useState<string | null>(() => (
        typeof navigator === "undefined" || navigator.onLine ? null : offlineMessage
    ));

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => {
            setIsOnline(false);
            setNetworkNotice(offlineMessage);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [offlineMessage]);

    useEffect(() => {
        if (!isOnline) {
            setNetworkNotice(offlineMessage);
        }
    }, [isOnline, offlineMessage]);

    useEffect(() => {
        if (!networkNotice || pauseAutoDismiss || !isOnline) return;
        const timer = window.setTimeout(() => setNetworkNotice(null), autoDismissMs);
        return () => window.clearTimeout(timer);
    }, [autoDismissMs, isOnline, networkNotice, pauseAutoDismiss]);

    return { isOnline, networkNotice, setNetworkNotice } as const;
}
