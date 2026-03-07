import { useEffect, useRef, useState } from "react";

const DEFAULT_SESSION_EXPIRED_MESSAGE = "会话已过期，请重新登录";
export const DEFAULT_SESSION_WARNING_WINDOW_MS = 5 * 60 * 1000;

export function getSessionTimeoutDelays(
    sessionExpiresAt: string | null | undefined,
    now = Date.now(),
    warningWindowMs = DEFAULT_SESSION_WARNING_WINDOW_MS,
) {
    if (!sessionExpiresAt) return null;

    const expiresAt = new Date(sessionExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return null;

    const warnAt = expiresAt - warningWindowMs;
    return {
        warnDelay: Math.max(0, warnAt - now),
        expireDelay: Math.max(0, expiresAt - now),
    };
}

function useLatestRef<T>(value: T) {
    const ref = useRef(value);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref;
}

export function useSessionWarningTimeout(options: {
    enabled: boolean;
    sessionExpiresAt: string | null | undefined;
    onExpire: (message: string) => void;
    warningWindowMs?: number;
}) {
    const {
        enabled,
        sessionExpiresAt,
        onExpire,
        warningWindowMs = DEFAULT_SESSION_WARNING_WINDOW_MS,
    } = options;
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const onExpireRef = useLatestRef(onExpire);

    useEffect(() => {
        if (!enabled) {
            setShowSessionWarning(false);
            return;
        }

        const delays = getSessionTimeoutDelays(sessionExpiresAt, Date.now(), warningWindowMs);
        if (!delays) {
            setShowSessionWarning(false);
            return;
        }

        const warnTimer = window.setTimeout(() => {
            setShowSessionWarning(true);
        }, delays.warnDelay);
        const expireTimer = window.setTimeout(() => {
            setShowSessionWarning(false);
            onExpireRef.current(DEFAULT_SESSION_EXPIRED_MESSAGE);
        }, delays.expireDelay);

        return () => {
            window.clearTimeout(warnTimer);
            window.clearTimeout(expireTimer);
        };
    }, [enabled, sessionExpiresAt, warningWindowMs, onExpireRef]);

    return { showSessionWarning, setShowSessionWarning };
}

export function useSessionExpiryEvent(options: {
    enabled: boolean;
    eventName: string;
    onExpire: (message: string) => void;
}) {
    const { enabled, eventName, onExpire } = options;
    const onExpireRef = useLatestRef(onExpire);

    useEffect(() => {
        if (!enabled) return;

        const handleSessionExpired = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            onExpireRef.current(detail?.message ?? DEFAULT_SESSION_EXPIRED_MESSAGE);
        };

        window.addEventListener(eventName, handleSessionExpired as EventListener);
        return () => {
            window.removeEventListener(eventName, handleSessionExpired as EventListener);
        };
    }, [enabled, eventName, onExpireRef]);
}