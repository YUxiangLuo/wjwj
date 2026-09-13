import { createApiClient } from "@/lib/api-client";
import type { ResearchList, ResearchRun, ResearchSpec } from "@/domain/experiment/research-analysis";
const { request } = createApiClient("student");
export const researchApi = {
    list: (taskId: number, signal?: AbortSignal) => request<ResearchList>(`/api/student/tasks/${taskId}/research-analyses`, { signal, cache: "no-store" }),
    run: (taskId: number, data: { requestKey: string; observedVersion: number; spec: ResearchSpec }, signal?: AbortSignal) => request<{ run: ResearchRun; replayed: boolean }>(`/api/student/tasks/${taskId}/research-analyses`, { method: "POST", body: JSON.stringify(data), signal }),
};
