import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";

type AuthResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

/** Shared teacher/admin bootstrap: an unavailable identity service is not logout. */
export function useWorkspaceAuth<T>(fetchUser: () => Promise<AuthResponse<T>>) {
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
            else if (response.error?.code === "UNAUTHORIZED" || response.error?.code === "SESSION_EXPIRED") setUser(null);
            else setError("暂时无法确认登录状态，请检查网络或稍后重试。");
        } catch {
            if (request === version.current) setError("暂时无法确认登录状态，请检查网络或稍后重试。");
        } finally {
            if (request === version.current) setChecking(false);
        }
    }, [fetchUser]);
    useEffect(() => {
        window.addEventListener(AUTH_EXPIRED_EVENT, clearUser);
        void retry();
        return () => { version.current++; window.removeEventListener(AUTH_EXPIRED_EVENT, clearUser); };
    }, [clearUser, retry]);
    return { user, checking, error, retry, clearUser };
}
