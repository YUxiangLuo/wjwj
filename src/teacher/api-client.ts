/**
 * Teacher API Client
 * 教师端 前端 API 调用工具
 */

import { shouldDispatchSessionExpired, createSessionExpiredInterceptor } from "@/lib/session-expired";
import { parseJsonApiResponse } from "@/lib/api-response";
import type { Question } from "@/lib/questionnaire-types";
import type { QuestionnaireData, SamplePlanData, SamplingResultsData } from "../student/api-client";

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

export interface TeacherStats {
    stats: {
        label: string;
        value: number;
    }[];
    recentSubmissions: {
        student: string;
        class: string;
        topic: string;
        time: string;
    }[];
    recentGradings: {
        student: string;
        class: string;
        topic: string;
        score: string | null;
        rejected: boolean;
        time: string;
    }[];
}

export interface TeacherClass {
    id: number;
    name: string;
    semester: string | null;
    studentCount: number;
    createdAt: string;
}

export interface Topic {
    id: number;
    name: string;
    description: string | null;
    status: number; // 0=draft, 1=published
    dataRows: number;
    createdAt: string;
}

export interface TopicAttachment {
    id: number;
    topicId: number;
    fileName: string;
    filePath: string;
    fileType: string;
    fileSize: number;
    createdAt: string;
}

export interface TopicDetail {
    topic: any;
    attachments: TopicAttachment[];
    recommendQuestions: Question[];
    excelInfo?: { columns: string[]; preview: any[] } | null;
}

export type { Question };

export interface Task {
    id: number;
    topicId: number;
    classId: number;
    topic: string; // name
    className: string; // name
    publishedAt: string | null;
    deadline: string | null;
    total: number;
    completed: number;
    pending: number;
}

export interface TaskProgressData {
    task: { topicName: string; className: string; deadline: string | null };
    counts: { not_started: number; stage1: number; stage2: number; stage3: number; stage4: number; submitted: number; graded: number; rejected: number };
    students: { studentId: string; name: string; status: string; stage: number | null; lastActivity: string | null; submissionId: number | null }[];
}

export interface GradingItem {
    id: number;
    studentName: string;
    studentId: string;
    topic: string;
    className: string;
    submittedAt: string;
    status: number; // 0|1=待批改(0 为历史数据), 2=graded, 3=rejected
    score: number | null;
    gradedByType?: number | null; // 2=教师, 3=助教
    gradedById?: number | null;
    gradedByName?: string | null; // 批改人名称
    gradedAt?: string | null;
}

export interface GradingListResponse {
    items: GradingItem[];
    total: number;
    page: number;
    pageSize: number;
}

export interface GradingListParams {
    status?: string;
    className?: string;
    topicName?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
}

export interface SubmissionDetail extends GradingItem {
    topicDesc: string;
    reportContent: string;
    samplePlan: SamplePlanData | null;
    questionnaire: QuestionnaireData | null;
    samplingResults?: SamplingResultsData | null;
    questionnairePdfPath?: string | null;
    reportPdfPath?: string | null;
    pdfStatus?: "pending" | "generating" | "ready" | "failed";
    pdfStatusMessage?: string | null;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason?: string | null;
    weights?: { questionnaire: number; process: number; report: number };
    readonly?: boolean;
    isAssistant?: boolean; // 当前用户是否是助教
}

export interface Student {
    id: number;
    studentId: string;
    name: string;
    email: string | null;
    status: number; // 1=active, 0=disabled
    isFirstLogin: number; // 1=first login, 0=already logged in
    lastLogin: string | null;
}

export interface Assistant {
    id: number;
    name: string;
    studentId: string; // account
    email: string;
    assignedClasses: string[]; // names
    assignedClassIds: number[];
    status?: number;
    lastLogin?: string | null;
}

export interface TeacherUser {
    id: number;
    employeeId?: string;
    account?: string;
    name: string;
    isFirstLogin: number;
    type: "teacher" | "assistant";
    creatorTeacherId?: number; // 仅助教有此字段
    sessionExpiresAt?: string | null;
}

export interface TeacherNotification {
    id: number;
    type: string;
    title: string;
    content: string;
    isRead: number;
    createdAt: string;
    relatedType: string | null;
    relatedId: number | null;
}

export interface TeacherNotificationsResponse {
    notifications: TeacherNotification[];
    unreadCount: number;
}

export interface TeacherAnnouncement {
    id: number;
    title: string;
    content: string;
    createdAt: string;
    isRead: number;
}

export interface TeacherAnnouncementsResponse {
    announcements: TeacherAnnouncement[];
    unreadCount: number;
}

export interface GradeExportPreviewItem {
    taskId: number;
    topicId: number;
    topic: string;
    classId: number;
    className: string;
    graded: number;
    total: number;
    avgScore: number;
}

export interface GradeExportRow {
    studentId: string;
    name: string;
    className: string;
    topicName: string;
    submittedAt: string;
    scoreQuestionnaire: string | number;
    scoreProcess: string | number;
    scoreReport: string | number;
    totalScore: string | number;
    status: string;
    gradedAt: string;
    gradedBy: string;
}

// ============================================================
// API Client
// ============================================================

const interceptSessionExpired = createSessionExpiredInterceptor("/api/teacher/login", "teacher:session-expired");

export function shouldDispatchTeacherSessionExpired(
    url: string,
    status: number,
    response: Pick<ApiResponse<unknown>, "error"> | null | undefined,
) {
    return shouldDispatchSessionExpired(url, status, response, "/api/teacher/login");
}

async function parseApiResponse<T>(url: string, res: Response): Promise<ApiResponse<T>> {
    return await parseJsonApiResponse<T>(url, res, interceptSessionExpired) as ApiResponse<T>;
}

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
            credentials: "include",
            ...options,
        });

        return await parseApiResponse<T>(url, res);
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

export const authApi = {
    login: (data: { employeeId: string; password: string }) =>
        request<{ user: TeacherUser; expiresAt: string }>("/api/teacher/login", {
            method: "POST",
            body: JSON.stringify(data)
        }),

    me: () => request<TeacherUser>("/api/teacher/me"),

    logout: () =>
        request<{ ok: boolean }>("/api/teacher/logout", {
            method: "POST",
        }),

    changePassword: (data: { currentPassword: string; newPassword: string }) =>
        request<{ success: boolean }>("/api/teacher/password", {
            method: "PUT",
            body: JSON.stringify(data),
        }),
};

export const teacherApi = {
    // Dashboard
    getStats: () => request<TeacherStats>("/api/teacher/dashboard"),

    // Classes
    getClasses: () => request<TeacherClass[]>("/api/teacher/classes"),

    // Topics
    getTopics: () => request<Topic[]>("/api/teacher/topics"),
        getTopicDetail: (id: number) => request<TopicDetail>(`/api/teacher/topics/${id}/detail`),
    createTopic: (data: { name: string; description?: string }) =>
        request<{ id: number }>("/api/teacher/topics", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateTopic: (id: number, data: { name?: string; description?: string; status?: number }) =>
        request<{ success: boolean }>(`/api/teacher/topics/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),
    deleteTopic: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/topics/${id}`, {
            method: "DELETE"
        }),
        uploadTopicExcel: async (id: number, file: File) => {
            try {
                const formData = new FormData();
                formData.append("file", file);
                const res = await fetch(`/api/teacher/topics/${id}/excel`, {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                });
                return await parseApiResponse<{ filePath: string; rowCount: number; colCount: number; columns: string[]; preview: any[] }>(`/api/teacher/topics/${id}/excel`, res);
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "NETWORK_ERROR",
                        message: error instanceof Error ? error.message : "网络请求失败",
                    },
                };
            }
        },
        updateFieldMapping: (id: number, fieldMapping: any) =>
            request<{ success: boolean }>(`/api/teacher/topics/${id}/mapping`, {
                method: "PUT",
                body: JSON.stringify({ fieldMapping })
            }),
        uploadAttachment: async (id: number, file: File) => {
            try {
                const formData = new FormData();
                formData.append("file", file);
                const res = await fetch(`/api/teacher/topics/${id}/attachments`, {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                });
                return await parseApiResponse<{ id: number; filePath: string }>(`/api/teacher/topics/${id}/attachments`, res);
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "NETWORK_ERROR",
                        message: error instanceof Error ? error.message : "网络请求失败",
                    },
                };
            }
        },
        deleteAttachment: (topicId: number, attachmentId: number) =>
            request<{ success: boolean }>(`/api/teacher/topics/${topicId}/attachments/${attachmentId}`, {
                method: "DELETE"
            }),
        updateRecommendQuestions: (id: number, items: Question[]) =>
            request<{ success: boolean }>(`/api/teacher/topics/${id}/recommend-questions`, {
                method: "PUT",
                body: JSON.stringify({ items })
            }),
        updateWeightConfig: (id: number, weightConfig: { questionnaire: number; process: number; report: number }) =>
            request<{ success: boolean }>(`/api/teacher/topics/${id}/weights`, {
                method: "PUT",
                body: JSON.stringify({ weightConfig })
            }),
        copyTopic: (id: number) =>
            request<{ id: number }>(`/api/teacher/topics/${id}/copy`, { method: "POST" }),

    // Tasks
    getTasks: () => request<Task[]>("/api/teacher/tasks"),
    /** `deadline` 为 ISO-8601 UTC 字符串（由本地时间 `toISOString()` 得到），可选 */
    createTask: (data: { topicId: number; classIds: number[]; deadline?: string }) =>
        request<{ success: boolean }>("/api/teacher/tasks", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    /** `deadline` 为 ISO-8601 UTC 字符串 */
    extendTaskDeadline: (taskId: number, deadline: string) =>
        request<{ success: boolean }>(`/api/teacher/tasks/${taskId}/extend`, {
            method: "PUT",
            body: JSON.stringify({ deadline })
        }),
    deleteTask: (taskId: number) =>
        request<{ success: boolean }>(`/api/teacher/tasks/${taskId}`, { method: "DELETE" }),
    getTaskProgress: (taskId: number) =>
        request<TaskProgressData>(`/api/teacher/tasks/${taskId}/progress`),

    // Grading
    getGradingList: (params: GradingListParams = {}) => {
        const search = new URLSearchParams();
        if (params.status) search.set("status", params.status);
        if (params.className) search.set("className", params.className);
        if (params.topicName) search.set("topicName", params.topicName);
        if (params.keyword) search.set("keyword", params.keyword);
        if (params.page) search.set("page", String(params.page));
        if (params.pageSize) search.set("pageSize", String(params.pageSize));
        const qs = search.toString();
        return request<GradingListResponse>(`/api/teacher/grading${qs ? `?${qs}` : ""}`);
    },

    getSubmissionDetail: (id: number) =>
        request<SubmissionDetail>(`/api/teacher/grading/${id}`),

    submitGrade: (id: number, data: {
        scoreQuestionnaire: number;
        scoreProcess: number;
        scoreReport: number;
        totalScore: number;
        comment: string;
        status: number;
        rejectReason?: string;
    }) => request<{ success: boolean }>(`/api/teacher/grading/${id}`, {
        method: "POST",
        body: JSON.stringify(data)
    }),

    // Student Management
    getStudents: (classId: number) =>
        request<Student[]>(`/api/teacher/classes/${classId}/students`),

    addStudent: (classId: number, data: { studentId: string; name: string; email?: string }) =>
        request<{ success: boolean }>(`/api/teacher/classes/${classId}/students`, {
            method: "POST",
            body: JSON.stringify(data)
        }),

    updateStudent: (studentId: number, data: { action: "reset_password" | "toggle_status" }) =>
        request<{ success: boolean }>(`/api/teacher/students/${studentId}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),

    deleteStudent: (studentId: number) =>
        request<{ success: boolean }>(`/api/teacher/students/${studentId}`, {
            method: "DELETE"
        }),

    importStudents: async (classId: number, file: File) => {
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`/api/teacher/classes/${classId}/students/import`, {
                method: "POST",
                body: formData,
                credentials: "include",
            });

            return await parseApiResponse<{ successCount: number; failureCount: number; errors: Array<{ row: number; reason: string }> }>(`/api/teacher/classes/${classId}/students/import`, res);
        } catch (error) {
            return {
                success: false,
                error: {
                    code: "NETWORK_ERROR",
                    message: error instanceof Error ? error.message : "网络请求失败",
                },
            };
        }
    },

    // Assistant Management
    getAssistants: () => request<Assistant[]>("/api/teacher/assistants"),

    createAssistant: (data: { name: string; studentId: string }) =>
        request<{ success: boolean }>("/api/teacher/assistants", {
            method: "POST",
            body: JSON.stringify(data)
        }),

    updateAssistant: (id: number, data: { action: "reset_password" | "toggle_status" | "delete" }) =>
        request<{ success: boolean }>(`/api/teacher/assistants/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),

    deleteAssistant: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/assistants/${id}`, {
            method: "DELETE"
        }),

    assignClasses: (id: number, classIds: number[]) =>
        request<{ success: boolean }>(`/api/teacher/assistants/${id}/classes`, {
            method: "POST",
            body: JSON.stringify({ classIds })
        }),

    // Notifications
    getNotifications: () => request<TeacherNotificationsResponse>("/api/teacher/notifications"),
    readNotification: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/notifications/${id}/read`, { method: "PUT" }),
    readAllNotifications: () =>
        request<{ success: boolean }>("/api/teacher/notifications/read-all", { method: "PUT" }),

    // Announcements
    getAnnouncements: () => request<TeacherAnnouncementsResponse>("/api/teacher/announcements"),
    markAnnouncementRead: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/announcements/${id}/read`, { method: "PUT" }),

    // Grade export
    getGradeExportPreview: (params: { semester?: string; classId?: number | string; topicId?: number | string }) => {
        const search = new URLSearchParams();
        if (params.semester !== undefined) search.set("semester", String(params.semester));
        if (params.classId !== undefined) search.set("classId", String(params.classId));
        if (params.topicId !== undefined) search.set("topicId", String(params.topicId));
        return request<GradeExportPreviewItem[]>(`/api/teacher/grade-export/preview?${search.toString()}`);
    },
    getGradeExportData: (params: { semester?: string; classId?: number | string; topicId?: number | string; taskId?: number | string }) => {
        const search = new URLSearchParams();
        if (params.semester !== undefined) search.set("semester", String(params.semester));
        if (params.classId !== undefined) search.set("classId", String(params.classId));
        if (params.topicId !== undefined) search.set("topicId", String(params.topicId));
        if (params.taskId !== undefined) search.set("taskId", String(params.taskId));
        return request<GradeExportRow[]>(`/api/teacher/grade-export/data?${search.toString()}`);
    },
};
