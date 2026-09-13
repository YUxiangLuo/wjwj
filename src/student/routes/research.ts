import { parseResearchSpec, ResearchAnalysisError } from "@/domain/experiment/research-analysis";
import { error, getPositiveRouteId, json, parseBody } from "@/server/http";
import type { RouteDefinition } from "@/server/route-types";
import { listResearchRuns, saveResearchRun } from "../experiment/research-service";
import { requireAuth } from "./auth";
async function authorizeSameStudent(req: Request, studentId: number) {
    const current = await requireAuth(req);
    if (current.error || current.student?.id !== studentId) throw new ResearchAnalysisError("登录状态已改变，不能读取或保存分析结果", "UNAUTHORIZED", 401);
}
export const researchRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req); if (auth.error) return auth.error;
        const taskId = getPositiveRouteId(req); if (!taskId) return error("无效任务", "INVALID_ID");
        return json(await listResearchRuns(auth.student!.id, taskId, () => authorizeSameStudent(req, auth.student!.id)), 200, { "Cache-Control": "private, no-store" });
    },
    async POST(req) {
        const auth = await requireAuth(req); if (auth.error) return auth.error;
        const taskId = getPositiveRouteId(req); if (!taskId) return error("无效任务", "INVALID_ID");
        const body = await parseBody<Record<string, unknown>>(req);
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3 || Object.keys(body).some(k => !["spec", "requestKey", "observedVersion"].includes(k))) return error("只接受分析配置、请求身份和观察版本", "VALIDATION_ERROR");
        const spec = parseResearchSpec(body.spec);
        if (typeof spec === "string") return error(spec, "VALIDATION_ERROR");
        if (typeof body.observedVersion !== "number" || !Number.isSafeInteger(body.observedVersion) || body.observedVersion < 1 || typeof body.requestKey !== "string" || !/^r_[a-f0-9]{32}$/.test(body.requestKey)) return error("请求身份或实验版本无效", "VALIDATION_ERROR");
        return json(await saveResearchRun({ studentId: auth.student!.id, taskId, spec, observedVersion: body.observedVersion, requestKey: body.requestKey, signal: req.signal, authorize: () => authorizeSameStudent(req, auth.student!.id) }), 200, { "Cache-Control": "private, no-store" });
    },
};
