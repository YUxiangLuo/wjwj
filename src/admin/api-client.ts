/**
 * Admin API Client
 * 前端 API 调用工具
 */

// ============================================================
// Types
// ============================================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

export interface Stats {
    currentSemester: string;
    teacherCount: number;
    classCount: number;
    studentCount: number;
    assistantCount: number;
    todayLogins: number;
    todayActiveUsers: number;
    pendingItems: number;
}

export interface Semester {
    id: number;
    name: string;
    isCurrent: number;
    classCount: number;
    createdAt: string;
}

export interface Teacher {
    id: number;
    employeeId: string;
    name: string;
    status: number;
    isFirstLogin: number;
    isLocked: boolean;
    lockedUntil: string | null;
    classCount: number;
    lastLogin: string | null;
    createdAt: string;
}

export interface Assistant {
    id: number;
    account: string;
    name: string;
    creatorTeacherId: number;
    teacherName: string | null;
    status: number;
    isLocked: boolean;
    classCount: number;
    createdAt: string;
}

export interface Class {
    id: number;
    name: string;
    semesterId: number;
    semesterName: string | null;
    teacherId: number;
    teacherName: string | null;
    studentCount: number;
    createdAt: string;
}

export interface Student {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
    status: number;
    isLocked: boolean;
    progress: number;
    lastActive: string | null;
    createdAt: string;
}

export interface Announcement {
    id: number;
    title: string;
    content: string;
    status: number;
    createdAt: string;
    updatedAt: string;
}

// ============================================================
// API Client
// ============================================================

async function request<T>(
    url: string,
    options?: RequestInit
): Promise<ApiResponse<T>> {
    try {
        const res = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
            ...options,
        });

        const data = await res.json();
        return data as ApiResponse<T>;
    } catch (error) {
        return {
            success: false,
            error: {
                code: "NETWORK_ERROR",
                message: error instanceof Error ? error.message : "网络请求失败",
            },
        };
    }
}

// ============================================================
// Stats API
// ============================================================

export const statsApi = {
    getStats: () => request<Stats>("/api/admin/stats"),
};

// ============================================================
// Semester API
// ============================================================

export const semesterApi = {
    list: () => request<Semester[]>("/api/admin/semesters"),

    create: (data: { name: string; setAsCurrent?: boolean }) =>
        request<{ id: number }>("/api/admin/semesters", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    setCurrent: (id: number) =>
        request<{ success: boolean }>(`/api/admin/semesters/${id}/current`, {
            method: "PUT",
        }),

    delete: (id: number) =>
        request<{ success: boolean }>(`/api/admin/semesters/${id}`, {
            method: "DELETE",
        }),
};

// ============================================================
// Teacher API
// ============================================================

export const teacherApi = {
    list: (search?: string) =>
        request<Teacher[]>(
            `/api/admin/teachers${search ? `?search=${encodeURIComponent(search)}` : ""}`
        ),

    create: (data: { employeeId: string; name: string }) =>
        request<{ id: number }>("/api/admin/teachers", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    updateStatus: (id: number, status: number) =>
        request<{ success: boolean }>(`/api/admin/teachers/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status }),
        }),

    unlock: (id: number) =>
        request<{ success: boolean }>(`/api/admin/teachers/${id}/unlock`, {
            method: "PUT",
        }),

    resetPassword: (id: number) =>
        request<{ success: boolean }>(`/api/admin/teachers/${id}/reset-password`, {
            method: "POST",
        }),
};

// ============================================================
// Assistant API
// ============================================================

export const assistantApi = {
    list: (teacherId?: string) =>
        request<Assistant[]>(
            `/api/admin/assistants${teacherId && teacherId !== "all" ? `?teacher_id=${teacherId}` : ""}`
        ),

    create: (data: { account: string; name: string; teacherId: number }) =>
        request<{ id: number }>("/api/admin/assistants", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    updateStatus: (id: number, status: number) =>
        request<{ success: boolean }>(`/api/admin/assistants/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status }),
        }),

    delete: (id: number) =>
        request<{ success: boolean }>(`/api/admin/assistants/${id}`, {
            method: "DELETE",
        }),

    unlock: (id: number) =>
        request<{ success: boolean }>(`/api/admin/assistants/${id}/unlock`, {
            method: "PUT",
        }),

    resetPassword: (id: number) =>
        request<{ success: boolean }>(`/api/admin/assistants/${id}/reset-password`, {
            method: "POST",
        }),
};

// ============================================================
// Class API
// ============================================================

export const classApi = {
    list: (params?: { semesterId?: string; teacherId?: string }) => {
        const searchParams = new URLSearchParams();
        if (params?.semesterId && params.semesterId !== "all") {
            searchParams.set("semester_id", params.semesterId);
        }
        if (params?.teacherId && params.teacherId !== "all") {
            searchParams.set("teacher_id", params.teacherId);
        }
        const query = searchParams.toString();
        return request<Class[]>(`/api/admin/classes${query ? `?${query}` : ""}`);
    },

    create: (data: { name: string; semesterId: number; teacherId: number }) =>
        request<{ id: number }>("/api/admin/classes", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    update: (id: number, data: { name?: string; teacherId?: number }) =>
        request<{ success: boolean }>(`/api/admin/classes/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
        }),

    delete: (id: number) =>
        request<{ success: boolean }>(`/api/admin/classes/${id}`, {
            method: "DELETE",
        }),
};

// ============================================================
// Student API
// ============================================================

export const studentApi = {
    list: (params?: { classId?: string; search?: string }) => {
        const searchParams = new URLSearchParams();
        if (params?.classId && params.classId !== "all") {
            searchParams.set("class_id", params.classId);
        }
        if (params?.search) {
            searchParams.set("search", params.search);
        }
        const query = searchParams.toString();
        return request<Student[]>(`/api/admin/students${query ? `?${query}` : ""}`);
    },

    updateStatus: (id: number, status: number) =>
        request<{ success: boolean }>(`/api/admin/students/${id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status }),
        }),

    resetPassword: (id: number) =>
        request<{ success: boolean }>(`/api/admin/students/${id}/reset-password`, {
            method: "POST",
        }),
};

// ============================================================
// Announcement API
// ============================================================

export const announcementApi = {
    list: () => request<Announcement[]>("/api/admin/announcements"),

    create: (data: { title: string; content: string; publish?: boolean }) =>
        request<{ id: number }>("/api/admin/announcements", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    update: (id: number, data: { title?: string; content?: string }) =>
        request<{ success: boolean }>(`/api/admin/announcements/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
        }),

    delete: (id: number) =>
        request<{ success: boolean }>(`/api/admin/announcements/${id}`, {
            method: "DELETE",
        }),

    publish: (id: number) =>
        request<{ success: boolean }>(`/api/admin/announcements/${id}/publish`, {
            method: "PUT",
        }),

    unpublish: (id: number) =>
        request<{ success: boolean }>(`/api/admin/announcements/${id}/unpublish`, {
            method: "PUT",
        }),
};
