import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeAuthExpired } from "@/lib/authenticated-fetch";
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
        } else if (["UNAUTHORIZED", "SESSION_EXPIRED", "ACCOUNT_NOT_FOUND", "ACCOUNT_DISABLED", "SESSION_CHANGED"].includes(response.error?.code ?? "")) {
            clearAuthState();
        } else {
            // A service/network failure is not evidence that the session expired.
            setAuthError("暂时无法确认登录状态，请检查网络或稍后重试。当前页面地址和已保存的本地草稿会保留。");
        }
        setIsLoading(false);
    }, [clearAuthState]);

    useEffect(() => subscribeAuthExpired("student", clearAuthState), [clearAuthState]);

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
