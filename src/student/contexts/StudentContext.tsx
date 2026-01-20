import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { meApi, notificationsApi, sessionApi, type CurrentStudent, type NotificationsResponse } from "../api-client";

interface StudentContextValue {
    // 当前用户
    currentUser: CurrentStudent | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
    authErrorCode: string | null;

    // 会话
    sessionExpiresAt: string | null;
    refreshSession: () => Promise<void>;

    // 通知
    notifications: NotificationsResponse | null;
    unreadCount: number;
    refreshNotifications: () => Promise<void>;
    markNotificationAsRead: (id: number) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
}

const StudentContext = createContext<StudentContextValue | null>(null);

export function StudentProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<CurrentStudent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notifications, setNotifications] = useState<NotificationsResponse | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
    const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
    const refreshSeq = useRef(0);

    // 获取当前用户
    const refreshUser = useCallback(async () => {
        const seq = ++refreshSeq.current;
        setIsLoading(true);
        try {
            const res = await meApi.get();
            if (seq !== refreshSeq.current) return;
            if (res.success && res.data) {
                setCurrentUser(res.data);
                setAuthErrorCode(null);
                if (res.data.sessionExpiresAt) {
                    setSessionExpiresAt(res.data.sessionExpiresAt);
                }
            } else {
                setCurrentUser(null);
                setAuthErrorCode(res.error?.code ?? null);
                setSessionExpiresAt(null);
            }
        } catch {
            if (seq !== refreshSeq.current) return;
            setCurrentUser(null);
            setAuthErrorCode(null);
            setSessionExpiresAt(null);
        } finally {
            if (seq !== refreshSeq.current) return;
            setIsLoading(false);
        }
    }, []);

    const refreshSession = useCallback(async () => {
        try {
            const res = await sessionApi.get();
            if (res.success) {
                setSessionExpiresAt(res.data?.expiresAt ?? null);
            } else {
                setSessionExpiresAt(null);
            }
        } catch {
            setSessionExpiresAt(null);
        }
    }, []);

    // 获取通知
    const refreshNotifications = useCallback(async () => {
        try {
            const res = await notificationsApi.list();
            if (res.success && res.data) {
                setNotifications(res.data);
            }
        } catch {
            // 忽略错误
        }
    }, []);

    // 标记单个通知为已读
    const markNotificationAsRead = useCallback(async (id: number) => {
        try {
            const res = await notificationsApi.markAsRead(id);
            if (res.success) {
                // 更新本地状态
                setNotifications((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        unreadCount: Math.max(0, prev.unreadCount - 1),
                        notifications: prev.notifications.map((n) =>
                            n.id === id ? { ...n, isRead: 1 } : n
                        ),
                    };
                });
            }
        } catch {
            // 忽略错误
        }
    }, []);

    // 标记所有通知为已读
    const markAllNotificationsAsRead = useCallback(async () => {
        try {
            const res = await notificationsApi.markAllAsRead();
            if (res.success) {
                setNotifications((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        unreadCount: 0,
                        notifications: prev.notifications.map((n) => ({ ...n, isRead: 1 })),
                    };
                });
            }
        } catch {
            // 忽略错误
        }
    }, []);

    // 初始化
    useEffect(() => {
        refreshUser();
        refreshNotifications();
    }, [refreshUser, refreshNotifications]);

    const value: StudentContextValue = {
        currentUser,
        isLoading,
        isAuthenticated: !!currentUser,
        refreshUser,
        authErrorCode,
        sessionExpiresAt,
        refreshSession,
        notifications,
        unreadCount: notifications?.unreadCount ?? 0,
        refreshNotifications,
        markNotificationAsRead,
        markAllNotificationsAsRead,
    };

    return (
        <StudentContext.Provider value={value}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    const context = useContext(StudentContext);
    if (!context) {
        throw new Error("useStudent must be used within a StudentProvider");
    }
    return context;
}
