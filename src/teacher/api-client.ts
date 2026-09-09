import type { Question, QuestionnaireData } from "@/lib/questionnaire-types";
import type { SamplingPolicyV1 } from "@/lib/sampling-policy";
import { createApiClient } from "@/lib/api-client";
export type { ApiResponse } from "@/lib/api-client";
const { request, fetch: teacherFetch } = createApiClient("teacher");
export { teacherFetch };
import type { SamplePlanData, SamplingResultsData } from "@/domain/experiment/types";

export interface TeacherUser { id: number; employeeId: string; name: string; type: "teacher" }
export interface TeacherStats {
    stats: Array<{ label: string; value: number }>;
    activeTasks: Array<{ id: number; templateName: string; className: string; deadline: string | null; total: number; completed: number; pending: number; rejected: number }>;
}
export interface TeacherClass { id: number; name: string; semester: string | null; studentCount: number; createdAt: string }
export interface Topic { id: number; name: string; description: string | null; status: number; dataRows: number; hasTasks?: boolean; createdAt: string }
export interface TopicAttachment { id: number; topicId: number; fileName: string; fileType: string; fileSize: number; createdAt: string }
export interface TopicExcelInfo {
    rowCount?: number;
    colCount?: number;
    columns: string[];
    preview: any[];
    columnValues?: Record<string, string[]>;
    columnValuesTruncated?: string[];
}
export interface TopicDetail { topic: any; hasExcelFile: boolean; attachments: TopicAttachment[]; recommendQuestions: Question[]; excelInfo?: TopicExcelInfo | null }
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
    version: number;
    topicDesc: string | null;
    reportContent: string;
    samplePlan: SamplePlanData | null;
    questionnaire: QuestionnaireData | null;
    samplingResults?: SamplingResultsData | null;
    samplingPolicy?: SamplingPolicyV1;
    samplingAttempts?: Array<{
        id: number;
        method: "simple" | "systematic" | "pps" | "stratified";
        seed: number;
        sampleCount: number;
        details: Record<string, unknown>;
        createdAt: string;
    }>;
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
export interface GradeAnalytics {
    funnel: { total: number; notStarted: number; inProgress: number; pendingGrading: number; graded: number; rejected: number };
    scores: {
        count: number;
        average: number | null;
        median: number | null;
        componentAverages: { questionnaire: number | null; process: number | null; report: number | null };
        bands: Array<{ label: string; count: number }>;
    };
}
export interface GradeExportRow {
    studentId: string; name: string; className: string; topicName: string; submittedAt: string;
    scoreQuestionnaire: string | number; scoreProcess: string | number; scoreReport: string | number;
    totalScore: string | number; status: string; gradedAt: string; gradedBy: string;
}

function upload<T>(url: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return request<T>(url, { method: "POST", body });
}

export const authApi = {
    login: (data: { employeeId: string; password: string }) => request<{ user: TeacherUser }>("/api/teacher/login", { method: "POST", body: JSON.stringify(data) }),
    me: (signal?: AbortSignal) => request<TeacherUser>("/api/teacher/me", { signal }),
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
    uploadTopicExcel: (id: number, file: File) => upload<TopicExcelInfo>(`/api/teacher/topics/${id}/excel`, file),
    updateFieldMapping: (id: number, fieldMapping: any) => request<{ success: boolean }>(`/api/teacher/topics/${id}/mapping`, { method: "PUT", body: JSON.stringify({ fieldMapping }) }),
    updateSamplingPolicy: (id: number, samplingPolicy: SamplingPolicyV1) => request<{ success: boolean }>(`/api/teacher/topics/${id}/sampling-policy`, { method: "PUT", body: JSON.stringify({ samplingPolicy }) }),
    uploadAttachment: (id: number, file: File) => upload<{ id: number }>(`/api/teacher/topics/${id}/attachments`, file),
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
        for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, value === true ? "1" : String(value));
        return request<GradingListResponse>(`/api/teacher/grading${search.size ? `?${search}` : ""}`);
    },
    getSubmissionDetail: (id: number) => request<SubmissionDetail>(`/api/teacher/grading/${id}`),
    submitGrade: (id: number, observedVersion: number, data: { scoreQuestionnaire: number; scoreProcess: number; scoreReport: number; comment: string }) => request<{ success: boolean; totalScore: number }>(`/api/teacher/grading/${id}`, { method: "POST", body: JSON.stringify({ ...data, observedVersion }) }),
    rejectSubmission: (id: number, observedVersion: number, reason: string) => request<{ success: boolean }>(`/api/teacher/grading/${id}/reject`, { method: "POST", body: JSON.stringify({ reason, observedVersion }) }),

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
    getGradeAnalytics: (params: { semester?: string; classId?: number | string; topicId?: number | string }) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
        return request<GradeAnalytics>(`/api/teacher/grade-export/analytics?${search}`);
    },
    getGradeExportData: (params: { semester?: string; classId?: number | string; topicId?: number | string; taskId?: number | string }) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
        return request<GradeExportRow[]>(`/api/teacher/grade-export/data?${search}`);
    },
};
