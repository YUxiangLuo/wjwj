import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { meApi } from "../api-client";
import type { CurrentStudent } from "@/domain/experiment/student-contracts";

interface StudentContextValue {
    currentUser: CurrentStudent | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    authError: string | null;
    refreshUser: () => Promise<void>;
    clearAuthState: () => void;
}

const StudentContext = createContext<StudentContextValue | null>(null);

export function StudentProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<CurrentStudent | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [authError, setAuthError] = useState<string | null>(null);
    const requestVersion = useRef(0);

    const clearAuthState = useCallback(() => {
        requestVersion.current++;
        setCurrentUser(null);
        setAuthError(null);
        setIsLoading(false);
    }, []);

    const refreshUser = useCallback(async () => {
        const version = ++requestVersion.current;
        setIsLoading(true);
        setAuthError(null);
        const response = await meApi.get();
        if (version !== requestVersion.current) return;
        if (response.success && response.data) {
            setCurrentUser(response.data);
        } else if (response.error?.code === "UNAUTHORIZED" || response.error?.code === "SESSION_EXPIRED") {
            clearAuthState();
        } else {
            // A service/network failure is not evidence that the session expired.
            setAuthError("暂时无法确认登录状态，请检查网络或稍后重试。当前页面地址和已保存的本地草稿会保留。");
        }
        setIsLoading(false);
    }, [clearAuthState]);

    useEffect(() => {
        window.addEventListener(AUTH_EXPIRED_EVENT, clearAuthState);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearAuthState);
    }, [clearAuthState]);

    useEffect(() => {
        void refreshUser();
        return () => { requestVersion.current++; };
    }, [refreshUser]);

    return (
        <StudentContext.Provider value={{
            currentUser,
            isLoading,
            isAuthenticated: currentUser !== null,
            authError,
            refreshUser,
            clearAuthState,
        }}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    const context = useContext(StudentContext);
    if (!context) throw new Error("useStudent must be used within StudentProvider");
    return context;
}
