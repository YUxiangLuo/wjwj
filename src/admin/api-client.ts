import { notifyAuthExpired } from "@/lib/auth-expired";

export interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string } }
export interface Stats { currentSemester: string; teacherCount: number; classCount: number; studentCount: number; pendingItems: number }
export interface Semester { id: number; name: string; isCurrent: number; classCount: number; createdAt: string }
export interface Teacher { id: number; employeeId: string; name: string; status: number; classCount: number; createdAt: string }
export interface Class { id: number; name: string; semesterId: number; semesterName: string | null; teacherId: number; teacherName: string | null; studentCount: number; createdAt: string }
export interface Student { id: number; studentId: string; name: string; classId: number; className: string | null; status: number; lockedUntil: string | null; progress: number; createdAt: string }
export interface StudentExperiment {
    id: number; taskName: string | null; currentStage: number;
    status: "in_progress" | "submitted" | "graded" | "rejected";
    statusText: string; submitTime: string | null; score: number | null; lastUpdate: string | null; progress: number;
}
export interface Announcement { id: number; title: string; content: string; targetScope: "all" | "teacher" | "student"; status: number; createdAt: string; updatedAt: string }
export interface AdminUser { id: number; username: string; isFirstLogin: number }

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: { "Content-Type": "application/json", ...options?.headers },
        });
        const payload = await response.json() as ApiResponse<T>;
        notifyAuthExpired(response, payload.error?.code);
        return payload;
    } catch (cause) {
        return { success: false, error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" } };
    }
}

export const authApi = {
    login: (data: { username: string; password: string }) => request<{ user: AdminUser }>("/api/admin/login", { method: "POST", body: JSON.stringify(data) }),
    me: () => request<AdminUser>("/api/admin/me"),
    logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
    changePassword: (data: { currentPassword: string; newPassword: string }) => request<{ success: boolean }>("/api/admin/password", { method: "PUT", body: JSON.stringify(data) }),
};

export const statsApi = { getStats: () => request<Stats>("/api/admin/stats") };
export const semesterApi = {
    list: () => request<Semester[]>("/api/admin/semesters"),
    create: (data: { name: string; setAsCurrent?: boolean }) => request<{ id: number }>("/api/admin/semesters", { method: "POST", body: JSON.stringify(data) }),
    setCurrent: (id: number) => request<{ success: boolean }>(`/api/admin/semesters/${id}/current`, { method: "PUT" }),
    delete: (id: number) => request<{ success: boolean }>(`/api/admin/semesters/${id}`, { method: "DELETE" }),
    update: (id: number, data: { name: string }) => request<{ success: boolean }>(`/api/admin/semesters/${id}/update`, { method: "PUT", body: JSON.stringify(data) }),
};
export const teacherApi = {
    list: (search?: string) => request<Teacher[]>(`/api/admin/teachers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    create: (data: { employeeId: string; name: string }) => request<{ id: number }>("/api/admin/teachers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name: string }) => request<{ success: boolean }>(`/api/admin/teachers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    updateStatus: (id: number, status: number) => request<{ success: boolean }>(`/api/admin/teachers/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    resetPassword: (id: number) => request<{ success: boolean }>(`/api/admin/teachers/${id}/reset-password`, { method: "POST" }),
};
export const classApi = {
    list: (params?: { semesterId?: string; teacherId?: string }) => {
        const search = new URLSearchParams();
        if (params?.semesterId && params.semesterId !== "all") search.set("semester_id", params.semesterId);
        if (params?.teacherId && params.teacherId !== "all") search.set("teacher_id", params.teacherId);
        return request<Class[]>(`/api/admin/classes${search.size ? `?${search}` : ""}`);
    },
    create: (data: { name: string; semesterId: number; teacherId: number }) => request<{ id: number }>("/api/admin/classes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; teacherId?: number }) => request<{ success: boolean }>(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ success: boolean }>(`/api/admin/classes/${id}`, { method: "DELETE" }),
};
export const studentApi = {
    list: (params?: { classId?: string; search?: string }) => {
        const search = new URLSearchParams();
        if (params?.classId && params.classId !== "all") search.set("class_id", params.classId);
        if (params?.search) search.set("search", params.search);
        return request<Student[]>(`/api/admin/students${search.size ? `?${search}` : ""}`);
    },
    updateStatus: (id: number, status: number) => request<{ success: boolean }>(`/api/admin/students/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    resetPassword: (id: number) => request<{ success: boolean }>(`/api/admin/students/${id}/reset-password`, { method: "POST" }),
    getExperiments: (id: number) => request<StudentExperiment[]>(`/api/admin/students/${id}/experiments`),
};
export const announcementApi = {
    list: () => request<Announcement[]>("/api/admin/announcements"),
    create: (data: { title: string; content: string; publish?: boolean; targetScope?: string }) => request<{ id: number }>("/api/admin/announcements", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { title?: string; content?: string; targetScope?: string; status?: 0 | 1 }) => request<{ success: boolean }>(`/api/admin/announcements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ success: boolean }>(`/api/admin/announcements/${id}`, { method: "DELETE" }),
    publish: (id: number) => request<{ success: boolean }>(`/api/admin/announcements/${id}/publish`, { method: "PUT" }),
    unpublish: (id: number) => request<{ success: boolean }>(`/api/admin/announcements/${id}/unpublish`, { method: "PUT" }),
};
