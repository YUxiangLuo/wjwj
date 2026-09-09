import { createContext, useContext, type ReactNode } from "react";
import { useWorkspaceAuth } from "@/hooks/useWorkspaceAuth";
import { meApi } from "../api-client";
import type { CurrentStudent } from "@/domain/experiment/student-contracts";

interface StudentContextValue {
    currentUser: CurrentStudent | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    authError: string | null;
    retry: () => void;
}
const StudentContext = createContext<StudentContextValue | null>(null);

export function StudentProvider({ children }: { children: ReactNode }) {
    const { user, checking, error, retry } = useWorkspaceAuth(meApi.get);
    return <StudentContext.Provider value={{
        currentUser: user, isLoading: checking, isAuthenticated: user !== null, authError: error, retry,
    }}>{children}</StudentContext.Provider>;
}

export function useStudent() {
    const context = useContext(StudentContext);
    if (!context) throw new Error("useStudent must be used within StudentProvider");
    return context;
}
