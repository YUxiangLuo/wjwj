import type { Question } from "@/lib/questionnaire-types";
import { notifyAuthExpired } from "@/lib/auth-expired";
import type { QuestionnaireData, SamplePlanData, SamplingResultsData } from "../student/api-client";

export interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string } }
export interface TeacherUser { id: number; employeeId: string; name: string; type: "teacher" }
export interface TeacherStats {
    stats: Array<{ label: string; value: number }>;
    recentSubmissions: Array<{ student: string; class: string; topic: string; time: string }>;
    recentGradings: Array<{ student: string; class: string; topic: string; score: string | null; rejected: boolean; time: string }>;
}
export interface TeacherClass { id: number; name: string; semester: string | null; studentCount: number; createdAt: string }
export interface Topic { id: number; name: string; description: string | null; status: number; dataRows: number; createdAt: string }
export interface TopicAttachment { id: number; topicId: number; fileName: string; filePath: string; fileType: string; fileSize: number; createdAt: string }
export interface TopicDetail { topic: any; attachments: TopicAttachment[]; recommendQuestions: Question[]; excelInfo?: { columns: string[]; preview: any[] } | null }
export type { Question };
export interface Task {
    id: number; topicId: number; classId: number; topic: string; className: string;
    publishedAt: string | null; deadline: string | null; total: number; completed: number; pending: number;
}
export interface TaskProgressData {
    task: { topicName: string; className: string; deadline: string | null };
    counts: { not_started: number; stage1: number; stage2: number; stage3: number; stage4: number; submitted: number; graded: number; rejected: number };
    students: Array<{ studentId: string; name: string; status: string; stage: number | null; lastActivity: string | null; submissionId: number | null }>;
}
export type GradingStatus = "submitted" | "graded" | "rejected";
export interface GradingItem {
    id: number; studentName: string; studentId: string; topic: string; className: string;
    submittedAt: string; status: GradingStatus; score: number | null; gradedByName?: string | null; gradedAt?: string | null;
}
export interface GradingListResponse { items: GradingItem[]; total: number; page: number; pageSize: number }
export interface GradingListParams { status?: string; className?: string; topicName?: string; keyword?: string; page?: number; pageSize?: number }
export interface SubmissionDetail extends GradingItem {
    topicDesc: string | null;
    reportContent: string;
    samplePlan: SamplePlanData | null;
    questionnaire: QuestionnaireData | null;
    samplingResults?: SamplingResultsData | null;
    populationSize?: number | null;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason?: string | null;
    weights?: { questionnaire: number; process: number; report: number };
}
export interface Student { id: number; studentId: string; name: string; email: string | null; status: number }
export interface TeacherAnnouncement { id: number; title: string; content: string; createdAt: string }
export interface GradeExportPreviewItem { taskId: number; topicId: number; topic: string; classId: number; className: string; graded: number; total: number; avgScore: number }
export interface GradeExportRow {
    studentId: string; name: string; className: string; topicName: string; submittedAt: string;
    scoreQuestionnaire: string | number; scoreProcess: string | number; scoreReport: string | number;
    totalScore: string | number; status: string; gradedAt: string; gradedBy: string;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const payload = await response.json() as ApiResponse<T>;
    notifyAuthExpired(response, payload.error?.code);
    return payload;
}

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: { "Content-Type": "application/json", ...options?.headers },
        });
        return await parseApiResponse<T>(response);
    } catch (cause) {
        return { success: false, error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" } };
    }
}

async function upload<T>(url: string, file: File): Promise<ApiResponse<T>> {
    try {
        const formData = new FormData();
        formData.append("file", file);
        return await parseApiResponse<T>(await fetch(url, { method: "POST", body: formData, credentials: "include" }));
    } catch (cause) {
        return { success: false, error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" } };
    }
}

export const authApi = {
    login: (data: { employeeId: string; password: string }) => request<{ user: TeacherUser }>("/api/teacher/login", { method: "POST", body: JSON.stringify(data) }),
    me: () => request<TeacherUser>("/api/teacher/me"),
    logout: () => request<{ ok: boolean }>("/api/teacher/logout", { method: "POST" }),
    changePassword: (data: { currentPassword: string; newPassword: string }) => request<{ success: boolean }>("/api/teacher/password", { method: "PUT", body: JSON.stringify(data) }),
};

export const teacherApi = {
    getStats: () => request<TeacherStats>("/api/teacher/dashboard"),
    getClasses: () => request<TeacherClass[]>("/api/teacher/classes"),
    getTopics: () => request<Topic[]>("/api/teacher/topics"),
    getTopicDetail: (id: number) => request<TopicDetail>(`/api/teacher/topics/${id}/detail`),
    createTopic: (data: { name: string; description?: string }) => request<{ id: number }>("/api/teacher/topics", { method: "POST", body: JSON.stringify(data) }),
    updateTopic: (id: number, data: { name?: string; description?: string; status?: number }) => request<{ success: boolean }>(`/api/teacher/topics/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteTopic: (id: number) => request<{ success: boolean }>(`/api/teacher/topics/${id}`, { method: "DELETE" }),
    uploadTopicExcel: (id: number, file: File) => upload<{ filePath: string; rowCount: number; colCount: number; columns: string[]; preview: any[] }>(`/api/teacher/topics/${id}/excel`, file),
    updateFieldMapping: (id: number, fieldMapping: any) => request<{ success: boolean }>(`/api/teacher/topics/${id}/mapping`, { method: "PUT", body: JSON.stringify({ fieldMapping }) }),
    uploadAttachment: (id: number, file: File) => upload<{ id: number; filePath: string }>(`/api/teacher/topics/${id}/attachments`, file),
    deleteAttachment: (topicId: number, attachmentId: number) => request<{ success: boolean }>(`/api/teacher/topics/${topicId}/attachments/${attachmentId}`, { method: "DELETE" }),
    updateRecommendQuestions: (id: number, items: Question[]) => request<{ success: boolean }>(`/api/teacher/topics/${id}/recommend-questions`, { method: "PUT", body: JSON.stringify({ items }) }),
    updateWeightConfig: (id: number, weightConfig: { questionnaire: number; process: number; report: number }) => request<{ success: boolean }>(`/api/teacher/topics/${id}/weights`, { method: "PUT", body: JSON.stringify({ weightConfig }) }),
    copyTopic: (id: number) => request<{ id: number }>(`/api/teacher/topics/${id}/copy`, { method: "POST" }),

    getTasks: () => request<Task[]>("/api/teacher/tasks"),
    createTask: (data: { topicId: number; classIds: number[]; deadline?: string }) => request<{ success: boolean }>("/api/teacher/tasks", { method: "POST", body: JSON.stringify(data) }),
    extendTaskDeadline: (id: number, deadline: string) => request<{ success: boolean }>(`/api/teacher/tasks/${id}/extend`, { method: "PUT", body: JSON.stringify({ deadline }) }),
    deleteTask: (id: number) => request<{ success: boolean }>(`/api/teacher/tasks/${id}`, { method: "DELETE" }),
    getTaskProgress: (id: number) => request<TaskProgressData>(`/api/teacher/tasks/${id}/progress`),

    getGradingList: (params: GradingListParams = {}) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
        return request<GradingListResponse>(`/api/teacher/grading${search.size ? `?${search}` : ""}`);
    },
    getSubmissionDetail: (id: number) => request<SubmissionDetail>(`/api/teacher/grading/${id}`),
    submitGrade: (id: number, data: { scoreQuestionnaire: number; scoreProcess: number; scoreReport: number; comment: string }) => request<{ success: boolean; totalScore: number }>(`/api/teacher/grading/${id}`, { method: "POST", body: JSON.stringify(data) }),
    rejectSubmission: (id: number, reason: string) => request<{ success: boolean }>(`/api/teacher/grading/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),

    getStudents: (classId: number) => request<Student[]>(`/api/teacher/classes/${classId}/students`),
    addStudent: (classId: number, data: { studentId: string; name: string; email?: string }) => request<{ success: boolean }>(`/api/teacher/classes/${classId}/students`, { method: "POST", body: JSON.stringify(data) }),
    updateStudent: (id: number, data: { action: "reset_password" | "toggle_status" }) => request<{ success: boolean }>(`/api/teacher/students/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteStudent: (id: number) => request<{ success: boolean }>(`/api/teacher/students/${id}`, { method: "DELETE" }),
    importStudents: (classId: number, file: File) => upload<{ successCount: number; failureCount: number; errors: Array<{ row: number; reason: string }> }>(`/api/teacher/classes/${classId}/students/import`, file),

    getAnnouncements: () => request<TeacherAnnouncement[]>("/api/teacher/announcements"),
    getGradeExportPreview: (params: { semester?: string; classId?: number | string; topicId?: number | string }) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
        return request<GradeExportPreviewItem[]>(`/api/teacher/grade-export/preview?${search}`);
    },
    getGradeExportData: (params: { semester?: string; classId?: number | string; topicId?: number | string; taskId?: number | string }) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
        return request<GradeExportRow[]>(`/api/teacher/grade-export/data?${search}`);
    },
};
