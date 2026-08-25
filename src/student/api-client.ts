import type { Question, QuestionnaireData, QuestionType } from "@/lib/questionnaire-types";
import { notifyAuthExpired } from "@/lib/auth-expired";

export type MethodKey = "simple" | "systematic" | "pps" | "stratified";
export type ExperimentStatus = "in_progress" | "submitted" | "graded" | "rejected";

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
}

export interface CurrentStudent {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
    isFirstLogin: number;
}

export type TaskStatus = "not_started" | ExperimentStatus;

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

export interface TopicAttachment { id: number; name: string; type: string; size: number }

export interface TaskDetail extends Omit<StudentTask, "progress"> {
    populationSize: number;
    attachments: TopicAttachment[];
    recommendQuestions: Question[];
}

export type { QuestionType, Question, QuestionnaireData };

export interface SamplePlanData {
    estimationType?: "proportion" | "mean";
    advancedPlanSource?: "cost" | "multivar" | "cv" | "cluster";
    confidenceLevel: string;
    marginOfError: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
    recommendedSize: number;
    finalSampleSize: number;
}

export interface SamplingResultsData {
    simple?: { completed: boolean; sampleCount: number; seed?: number; indices?: number[]; data?: unknown[] };
    systematic?: {
        completed: boolean;
        /** Fractional K=N/n written by the exact-n algorithm. */
        interval?: number;
        /** Legacy integer interval retained for stored snapshot compatibility. */
        kValue?: number;
        sampleCount: number;
        seed?: number;
        indices?: number[];
        randomStart?: number;
        /** Legacy selected starting index. */
        startIndex?: number;
        data?: unknown[];
    };
    pps?: {
        completed?: boolean;
        unavailable?: boolean;
        unavailableReason?: string;
        sizeField?: string;
        sampleCount?: number;
        seed?: number;
        randomStart?: number;
        inclusionProbabilities?: number[];
        indices?: number[];
        data?: unknown[];
    };
    stratified?: {
        completed: boolean;
        stratifyBy: string;
        layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
        sampleCount?: number;
        seed?: number;
        indices?: number[];
        data?: unknown[];
    };
}

export interface ExperimentData {
    id: number;
    taskId: number;
    version: number;
    currentStage: number;
    status: ExperimentStatus;
    questionnaire: QuestionnaireData | null;
    samplePlan: SamplePlanData | null;
    samplingResults: SamplingResultsData | null;
    reportContent: string | null;
    stage1CompletedAt: string | null;
    stage2CompletedAt: string | null;
    stage3CompletedAt: string | null;
    stage4CompletedAt: string | null;
    populationSize: number;
}

export interface AnalysisNumericFieldMetrics {
    populationMean: number;
    populationVariance: number;
    methods: Record<MethodKey, { estimate: number | null; standardError: number | null }>;
}
export interface AnalysisCategoricalFieldMetrics {
    population: Record<string, number>;
    methods: Record<MethodKey, Record<string, number>>;
    representativeness: Record<MethodKey, number | null>;
}
export interface AnalysisMetricsData {
    numericFields: string[];
    categoricalFields: string[];
    numeric: Record<string, AnalysisNumericFieldMetrics>;
    categorical: Record<string, AnalysisCategoricalFieldMetrics>;
}

export interface Announcement {
    id: number;
    title: string;
    content: string;
    createdAt: string;
}

export interface SubmissionDetail {
    id: number;
    taskId: number;
    version: number;
    topicId: number;
    topicName: string;
    submittedAt: string | null;
    status: Exclude<ExperimentStatus, "in_progress">;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason: string | null;
    gradedAt: string | null;
    graderName: string | null;
    weights: { questionnaire: number; process: number; report: number };
    snapshot: {
        topicName: string;
        studentName: string;
        populationSize: number | null;
        questionnaire: QuestionnaireData | null;
        samplePlan: SamplePlanData | null;
        samplingResults: SamplingResultsData | null;
        reportContent: string;
    };
}

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
        return {
            success: false,
            error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" },
        };
    }
}

export const meApi = { get: () => request<CurrentStudent>("/api/student/me") };

export const authApi = {
    login: (data: { studentId: string; password: string }) => request<{ user: CurrentStudent }>("/api/student/login", {
        method: "POST",
        body: JSON.stringify(data),
    }),
    logout: () => request<{ ok: boolean }>("/api/student/logout", { method: "POST" }),
    changePassword: (data: { currentPassword: string; newPassword: string }) => request<{ success: boolean }>("/api/student/password", {
        method: "PUT",
        body: JSON.stringify(data),
    }),
};

export const tasksApi = {
    list: () => request<StudentTask[]>("/api/student/tasks"),
    get: (taskId: number) => request<TaskDetail>(`/api/student/tasks/${taskId}`),
};

export const experimentApi = {
    get: (taskId: number) => request<ExperimentData>(`/api/student/tasks/${taskId}/experiment`),
    completeStage: (taskId: number, stage: number, observedVersion: number, data: Record<string, unknown>) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/experiment/stages/${stage}/complete`,
        { method: "POST", body: JSON.stringify({ ...data, observedVersion }) },
    ),
    reopenStage: (taskId: number, stage: number, observedVersion: number) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/experiment/stages/${stage}/reopen`,
        { method: "POST", body: JSON.stringify({ observedVersion }) },
    ),
    submit: (taskId: number, observedVersion: number) => request<{ success: boolean; experimentId: number }>(
        `/api/student/tasks/${taskId}/submit`,
        { method: "POST", body: JSON.stringify({ observedVersion }) },
    ),
    executeSampling: (taskId: number, method: MethodKey, params: unknown) => request<{ success: boolean; result: any }>(
        `/api/student/tasks/${taskId}/sampling`,
        { method: "POST", body: JSON.stringify({ method, params }) },
    ),
    getStats: (taskId: number) => request<{
        stats: Record<string, Record<string, number>>;
        numericFields?: string[];
        categoricalFields?: string[];
        categoricalStats?: Record<string, Record<string, number>>;
        populationNumericStats?: Record<string, { mean: number; variance: number; stdDev: number; count: number }>;
        ppsEligibleFields?: string[];
        stratumNumericStats?: Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>;
    }>(`/api/student/tasks/${taskId}/stats`),
    getAnalysisMetrics: (taskId: number) => request<AnalysisMetricsData>(`/api/student/tasks/${taskId}/analysis-metrics`),
};

export const announcementsApi = { list: () => request<Announcement[]>("/api/student/announcements") };

export const submissionsApi = {
    getByTask: (taskId: number) => request<SubmissionDetail>(`/api/student/tasks/${taskId}/submission`),
};
