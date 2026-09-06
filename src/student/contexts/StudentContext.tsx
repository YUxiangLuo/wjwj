import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { meApi } from "../api-client";
import type { CurrentStudent } from "@/domain/experiment/student-contracts";

interface StudentContextValue {
    currentUser: CurrentStudent | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
    clearAuthState: () => void;
}

const StudentContext = createContext<StudentContextValue | null>(null);

export function StudentProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<CurrentStudent | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        setIsLoading(true);
        const response = await meApi.get();
        setCurrentUser(response.success && response.data ? response.data : null);
        setIsLoading(false);
    }, []);

    const clearAuthState = useCallback(() => {
        setCurrentUser(null);
    }, []);

    useEffect(() => {
        window.addEventListener(AUTH_EXPIRED_EVENT, clearAuthState);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearAuthState);
    }, [clearAuthState]);

    useEffect(() => {
        void refreshUser();
    }, [refreshUser]);

    return (
        <StudentContext.Provider value={{
            currentUser,
            isLoading,
            isAuthenticated: currentUser !== null,
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
