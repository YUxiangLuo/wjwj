import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeAuthExpired, type AuthRole } from "@/lib/authenticated-fetch";

type AuthResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

/** Shared teacher/admin bootstrap: an unavailable identity service is not logout. */
export function useWorkspaceAuth<T>(fetchUser: () => Promise<AuthResponse<T>>, role: AuthRole) {
    const [user, setUser] = useState<T | null>(null);
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const version = useRef(0);
    const clearUser = useCallback(() => {
        version.current++;
        setUser(null);
        setError(null);
        setChecking(false);
    }, []);
    const retry = useCallback(async () => {
        const request = ++version.current;
        setChecking(true);
        setError(null);
        try {
            const response = await fetchUser();
            if (request !== version.current) return;
            if (response.success && response.data) setUser(response.data);
            else if (["UNAUTHORIZED", "SESSION_EXPIRED", "ACCOUNT_NOT_FOUND", "ACCOUNT_DISABLED", "SESSION_CHANGED"].includes(response.error?.code ?? "")) setUser(null);
            else setError("暂时无法确认登录状态，请检查网络或稍后重试。");
        } catch {
            if (request === version.current) setError("暂时无法确认登录状态，请检查网络或稍后重试。");
        } finally {
            if (request === version.current) setChecking(false);
        }
    }, [fetchUser]);
    useEffect(() => {
        const unsubscribe = subscribeAuthExpired(role, clearUser);
        void retry();
        return () => { version.current++; unsubscribe(); };
    }, [clearUser, retry, role]);
    return { user, checking, error, retry, clearUser };
}
