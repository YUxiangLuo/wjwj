import { useEffect, useRef, useState } from "react";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface AuthResponseLike<T> {
    success: boolean;
    data?: T;
    error?: {
        code?: string;
        message?: string;
    };
}

function getSessionStorage(): StorageLike | null {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
}

export function markLoginSuccess(loginSuccessKey: string, storage: StorageLike | null = getSessionStorage()) {
    storage?.setItem(loginSuccessKey, "1");
}

export function hasLoginSuccess(loginSuccessKey: string, storage: StorageLike | null = getSessionStorage()) {
    return storage?.getItem(loginSuccessKey) === "1";
}

export function clearLoginSuccess(loginSuccessKey: string, storage: StorageLike | null = getSessionStorage()) {
    storage?.removeItem(loginSuccessKey);
}

export function consumeLoginSuccess(loginSuccessKey: string, storage: StorageLike | null = getSessionStorage()) {
    if (!storage) return false;
    const hasLoginSuccess = storage.getItem(loginSuccessKey) === "1";
    if (hasLoginSuccess) {
        storage.removeItem(loginSuccessKey);
    }
    return hasLoginSuccess;
}

export function setLoginRedirectReason(
    redirectReasonKey: string,
    message: string,
    storage: StorageLike | null = getSessionStorage(),
) {
    if (!storage) return;
    if (storage.getItem(redirectReasonKey)) return;
    storage.setItem(redirectReasonKey, message);
}

export function consumeLoginRedirectReason(
    redirectReasonKey: string,
    storage: StorageLike | null = getSessionStorage(),
) {
    if (!storage) return null;
    const reason = storage.getItem(redirectReasonKey);
    if (reason) {
        storage.removeItem(redirectReasonKey);
    }
    return reason;
}

interface UseAuthBootstrapOptions<T> {
    enabled: boolean;
    fetchCurrentUser: () => Promise<AuthResponseLike<T>>;
    onAuthenticated: (response: AuthResponseLike<T>) => void;
    onUnauthenticated: (response?: AuthResponseLike<T>) => void;
}

export function useAuthBootstrap<T>({
    enabled,
    fetchCurrentUser,
    onAuthenticated,
    onUnauthenticated,
}: UseAuthBootstrapOptions<T>) {
    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        fetchCurrentUser()
            .then((response) => {
                if (cancelled) return;
                if (response.success) {
                    onAuthenticated(response);
                } else {
                    onUnauthenticated(response);
                }
            })
            .catch(() => {
                if (cancelled) return;
                onUnauthenticated();
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, fetchCurrentUser, onAuthenticated, onUnauthenticated]);
}

interface UseLoginSuccessRecoveryOptions {
    enabled: boolean;
    loginSuccessKey: string;
    onRecover: () => void | Promise<void>;
}

export function useLoginSuccessRecovery({
    enabled,
    loginSuccessKey,
    onRecover,
}: UseLoginSuccessRecoveryOptions) {
    const [isRecovering, setIsRecovering] = useState(false);
    const hasPendingRecovery = enabled && hasLoginSuccess(loginSuccessKey);
    const activeRecoveryIdRef = useRef(0);
    const onRecoverRef = useRef(onRecover);

    useEffect(() => {
        onRecoverRef.current = onRecover;
    }, [onRecover]);

    useEffect(() => {
        if (!enabled) {
            activeRecoveryIdRef.current += 1;
            setIsRecovering(false);
            return;
        }
        if (!hasLoginSuccess(loginSuccessKey)) {
            return;
        }
        if (!consumeLoginSuccess(loginSuccessKey)) {
            setIsRecovering(false);
            return;
        }

        const recoveryId = activeRecoveryIdRef.current + 1;
        activeRecoveryIdRef.current = recoveryId;
        setIsRecovering(true);

        Promise.resolve(onRecoverRef.current()).finally(() => {
            if (activeRecoveryIdRef.current === recoveryId) {
                setIsRecovering(false);
            }
        });
    }, [enabled, hasPendingRecovery, loginSuccessKey]);

    return isRecovering || hasPendingRecovery;
}

interface UseLoginRedirectReasonOptions {
    redirectReasonKey: string;
    onReason: (message: string) => void;
}

export function useLoginRedirectReason({ redirectReasonKey, onReason }: UseLoginRedirectReasonOptions) {
    useEffect(() => {
        const reason = consumeLoginRedirectReason(redirectReasonKey);
        if (reason) {
            onReason(reason);
        }
    }, [onReason, redirectReasonKey]);
}
