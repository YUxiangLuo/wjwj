/**
 * Student API Client
 * 学生端前端 API 调用工具
 */

import { shouldDispatchSessionExpired, createSessionExpiredInterceptor } from "@/lib/session-expired";

// ============================================================
// Types
// ============================================================

export type MethodKey = "simple" | "systematic" | "pps" | "stratified";

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

export interface CurrentStudent {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
    isFirstLogin: number;
    sessionExpiresAt?: string | null;
}

export interface SessionInfo {
    expiresAt: string | null;
}

export type TaskStatus = "not_started" | "in_progress" | "submitted" | "grading" | "graded" | "rejected";

export interface StudentTask {
    id: number;
    topicId: number;
    name: string;
    description: string | null;
    publishedAt: string;
    deadline: string | null;
    status: TaskStatus;
    progress: number;
    currentStage: number;
    score?: number;
    rejectReason?: string;
}

export interface TopicAttachment {
    id: number;
    name: string;
    type: string;
    size: number;
}

export interface RecommendQuestion {
    id: number;
    questionType: number;
    content: string;
    options: unknown;
    sortOrder: number;
}

export interface TaskDetail {
    id: number;
    topicId: number;
    name: string;
    description: string | null;
    publishedAt: string;
    deadline: string | null;
    populationSize: number;
    attachments: TopicAttachment[];
    recommendQuestions: RecommendQuestion[];
    status: TaskStatus;
    currentStage: number;
    score?: number;
    rejectReason?: string;
}

export type QuestionType = 'boolean' | 'single' | 'multiple' | 'scale';

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    options?: string[];           // 单选/多选的选项列表
    minSelect?: number;           // 多选最少选择数
    maxSelect?: number;           // 多选最多选择数
    scaleMin?: number;            // 量表最小值 (默认1)
    scaleMax?: number;            // 量表最大值 (默认10)
    scaleMinLabel?: string;       // 量表左端标签
    scaleMaxLabel?: string;       // 量表右端标签
}

export interface QuestionnaireData {
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Question[];
}

export interface SamplePlanData {
    confidenceLevel: string;
    marginOfError: number;
    designEffect: number;
    nonResponseRate: number;
    recommendedSize: number;
    finalSampleSize: number;
}

export interface SamplingResultsData {
    simple?: {
        completed: boolean;
        sampleCount: number;
        seed?: number;
        data?: unknown[];
    };
    systematic?: {
        completed: boolean;
        kValue: number;
        sampleCount: number;
        seed?: number;
        data?: unknown[];
    };
    pps?: {
        completed: boolean;
        sizeField: string;
        sampleCount: number;
        seed?: number;
        data?: unknown[];
    };
    stratified?: {
        completed: boolean;
        stratifyBy: string;
        layers: Array<{
            name: string;
            count: number;
            ratio: number;
            sampleCount: number;
        }>;
        seed?: number;
        data?: unknown[];
    };
}

export interface ExperimentData {
    id: number;
    taskId: number;
    currentStage: number;
    status: number;
    questionnaire: QuestionnaireData | null;
    samplePlan: SamplePlanData | null;
    samplingResults: SamplingResultsData | null;
    reportContent: string | null;
    lastSavedAt: string | null;
    populationSize: number;
}

export interface Notification {
    id: number;
    type: string;
    title: string;
    content: string;
    isRead: number;
    createdAt: string;
    relatedType: string | null;
    relatedId: number | null;
}

export interface NotificationsResponse {
    notifications: Notification[];
    unreadCount: number;
}

export interface Announcement {
    id: number;
    title: string;
    content: string;
    createdAt: string;
    isRead: boolean;
}

export interface SubmissionSummary {
    id: number;
    submittedAt: string;
    status: number;
    totalScore: number | null;
    gradedAt: string | null;
    graderName: string | null;
    rejectReason: string | null;
}

export interface SubmissionDetail {
    id: number;
    taskId: number;
    topicId: number;
    topicName: string;
    submittedAt: string;
    status: number;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason: string | null;
    gradedAt: string | null;
    graderName: string | null;
    questionnairePdfPath: string | null;
    reportPdfPath: string | null;
    pdfStatus: "pending" | "generating" | "ready" | "failed";
    pdfStatusMessage: string | null;
    weights: {
        questionnaire: number;
        process: number;
        report: number;
    };
}

// ============================================================
// API Client
// ============================================================

const interceptSessionExpired = createSessionExpiredInterceptor("/api/student/login", "student:session-expired");

export function shouldDispatchStudentSessionExpired(
    url: string,
    status: number,
    response: Pick<ApiResponse<unknown>, "error"> | null | undefined,
) {
    return shouldDispatchSessionExpired(url, status, response, "/api/student/login");
}

async function parseApiResponse<T>(url: string, res: Response): Promise<ApiResponse<T>> {
    const data = await res.json();
    interceptSessionExpired(url, res.status, data as ApiResponse<unknown>);
    return data as ApiResponse<T>;
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
            credentials: "include", // 包含 cookies
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

// ============================================================
// Me API - 当前用户
// ============================================================

export const meApi = {
    get: () => request<CurrentStudent>("/api/student/me"),
};

export const sessionApi = {
    get: () => request<SessionInfo>("/api/student/session"),
};

export const authApi = {
    login: (data: { studentId: string; password: string }) =>
        request<{ user: CurrentStudent; expiresAt: string }>("/api/student/login", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    logout: () =>
        request<{ ok: boolean }>("/api/student/logout", {
            method: "POST",
        }),

    changePassword: (data: { currentPassword: string; newPassword: string }) =>
        request<{ success: boolean }>("/api/student/password", {
            method: "PUT",
            body: JSON.stringify(data),
        }),
};

// ============================================================
// Tasks API - 任务
// ============================================================

export const tasksApi = {
    list: () => request<StudentTask[]>("/api/student/tasks"),

    get: (taskId: number) => request<TaskDetail>(`/api/student/tasks/${taskId}`),
};

// ============================================================
// Experiment API - 实验
// ============================================================

export const experimentApi = {
    get: (taskId: number) =>
        request<ExperimentData>(`/api/student/tasks/${taskId}/experiment`),

    save: (
        taskId: number,
        data: {
            currentStage?: number;
            questionnaire?: QuestionnaireData;
            samplePlan?: SamplePlanData;
            samplingResults?: SamplingResultsData;
            reportContent?: string;
        }
    ) =>
        request<ExperimentData>(
            `/api/student/tasks/${taskId}/experiment`,
            {
                method: "PUT",
                body: JSON.stringify(data),
            }
        ),

    submit: (taskId: number) =>
        request<{ success: boolean }>(`/api/student/tasks/${taskId}/submit`, {
            method: "POST",
        }),

    reset: (taskId: number, data: { resetToStage: number; clearQuestionnaire?: boolean }) =>
        request<ExperimentData>(`/api/student/tasks/${taskId}/reset`, {
            method: "POST",
            body: JSON.stringify(data),
        }),

    executeSampling: (
        taskId: number,
        method: MethodKey,
        params: any
    ) =>
        request<{ success: boolean; result: any }>(
            `/api/student/tasks/${taskId}/sampling`,
            {
                method: "POST",
                body: JSON.stringify({ method, params }),
            }
        ),

    getStats: (taskId: number) =>
        request<{
            stats: Record<string, Record<string, number>>;
            numericFields?: string[];
            stratumNumericStats?: Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>;
        }>(
            `/api/student/tasks/${taskId}/stats`
        ),
};

// ============================================================
// Notifications API - 通知
// ============================================================

export const notificationsApi = {
    list: () => request<NotificationsResponse>("/api/student/notifications"),

    markAsRead: (notificationId: number) =>
        request<{ success: boolean }>(
            `/api/student/notifications/${notificationId}/read`,
            { method: "PUT" }
        ),

    remove: (notificationId: number) =>
        request<{ success: boolean }>(
            `/api/student/notifications/${notificationId}`,
            { method: "DELETE" }
        ),

    markAllAsRead: () =>
        request<{ success: boolean }>("/api/student/notifications/read-all", {
            method: "PUT",
        }),
};

// ============================================================
// Announcements API - 公告
// ============================================================

export const announcementsApi = {
    list: () => request<Announcement[]>("/api/student/announcements"),

    markAsRead: (announcementId: number) =>
        request<{ success: boolean }>(
            `/api/student/announcements/${announcementId}/read`,
            { method: "PUT" }
        ),
};

// ============================================================
// Attachments API - 附件
// ============================================================

export const attachmentsApi = {
    getDownloadInfo: (attachmentId: number) =>
        request<{
            id: number;
            fileName: string;
            filePath: string;
            fileType: string;
            fileSize: number;
        }>(`/api/student/attachments/${attachmentId}/download`),
};

// ============================================================
// Submissions API - 提交记录
// ============================================================

export const submissionsApi = {
    listByTask: (taskId: number) =>
        request<SubmissionSummary[]>(`/api/student/tasks/${taskId}/submissions`),

    getDetail: (submissionId: number) =>
        request<SubmissionDetail>(`/api/student/submissions/${submissionId}`),
};
