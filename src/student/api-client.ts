export type { QuestionType, Question, QuestionnaireData } from "@/lib/questionnaire-types";
import type { QuestionnaireData } from "@/lib/questionnaire-types";
import type { MethodKey, ExperimentData, SamplePlanData } from "@/domain/experiment/types";
export type { MethodKey, ExperimentStatus, TaskStatus, SamplePlanData, SamplingResultsData, ExperimentWaveView, ExperimentData } from "@/domain/experiment/types";
import type { CurrentStudent, StudentTask, TaskDetail, Announcement, SubmissionDetail } from "@/domain/experiment/student-contracts";
export type { CurrentStudent, StudentTask, TopicAttachment, TaskDetail, Announcement, SubmissionDetail } from "@/domain/experiment/student-contracts";
import type { AnalysisMetricsData } from "@/domain/experiment/analysis-types";
export type { AnalysisNumericFieldMetrics, AnalysisCategoricalFieldMetrics, TargetMethodMetrics, TargetAnalysisMetrics, AnalysisMetricsData } from "@/domain/experiment/analysis-types";
import type { CleaningConfig } from "@/domain/fieldwork";
import { createApiClient } from "@/lib/api-client";
export type { ApiResponse } from "@/lib/api-client";
const { request, download: downloadStudentFile, resourceUrl: studentResourceUrl } = createApiClient("student");
export { downloadStudentFile, studentResourceUrl };

export const meApi = { get: (signal?: AbortSignal) => request<CurrentStudent>("/api/student/me", { signal }) };

export const authApi = {
    getDemoStudentCredential: (signal?: AbortSignal) => request<{ studentId: string; password: string }>(
        "/api/demo/student-credential",
        { cache: "no-store", signal },
    ),
    login: (data: { studentId: string; password: string }, signal?: AbortSignal) => request<{ user: CurrentStudent }>("/api/student/login", {
        method: "POST",
        body: JSON.stringify(data),
        signal,
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
    saveWavePlan: (taskId: number, observedVersion: number, samplePlan: SamplePlanData | Record<string, unknown>) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/experiment/plan`,
        { method: "POST", body: JSON.stringify({ observedVersion, samplePlan }) },
    ),
    saveWaveQuestionnaire: (taskId: number, observedVersion: number, questionnaire: QuestionnaireData) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/experiment/wave-questionnaire`,
        { method: "POST", body: JSON.stringify({ observedVersion, questionnaire }) },
    ),
    dispatchFieldwork: (taskId: number, observedVersion: number, seed?: number) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/fieldwork/dispatch`,
        { method: "POST", body: JSON.stringify({ observedVersion, ...(seed !== undefined ? { seed } : {}) }) },
    ),
    updateCleaningConfig: (taskId: number, observedVersion: number, cleaningConfig: CleaningConfig, waveNumber?: number) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/fieldwork/cleaning`,
        { method: "POST", body: JSON.stringify({ observedVersion, cleaningConfig, ...(waveNumber !== undefined ? { waveNumber } : {}) }) },
    ),
    createRefinementWave: (taskId: number, observedVersion: number) => request<ExperimentData>(
        `/api/student/tasks/${taskId}/fieldwork/new-wave`,
        { method: "POST", body: JSON.stringify({ observedVersion }) },
    ),
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
    getStats: (taskId: number, signal?: AbortSignal) => request<{
        stats: Record<string, Record<string, number>>;
        numericFields?: string[];
        categoricalFields?: string[];
        categoricalStats?: Record<string, Record<string, number>>;
        populationNumericStats?: Record<string, { mean: number; variance: number; stdDev: number; count: number }>;
        ppsEligibleFields?: string[];
        stratumNumericStats?: Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>;
    }>(`/api/student/tasks/${taskId}/stats`, { signal }),
    getAnalysisMetrics: (taskId: number, signal?: AbortSignal) => request<AnalysisMetricsData>(
        `/api/student/tasks/${taskId}/analysis-metrics`, { signal },
    ),
};

export const announcementsApi = { list: () => request<Announcement[]>("/api/student/announcements") };

export const submissionsApi = {
    getByTask: (taskId: number) => request<SubmissionDetail>(`/api/student/tasks/${taskId}/submission`),
};
