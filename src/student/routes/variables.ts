import { error, getPositiveRouteId, handleServerError, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { readVariableSource } from "../../server/variable-source";
import { validateDictionary } from "../../domain/variables/dictionary";
import { findStudentTaskSamplingInfo } from "../experiment/task-info";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { AnalysisConflict, createSavedAnalysis, listSavedAnalyses } from "../experiment/saved-analysis-service";
import { requireAuth } from "./auth";

function failure(cause: unknown) {
    return cause instanceof AnalysisConflict ? error(cause.message, cause.code, cause.status) : handleServerError(cause);
}

export const studentVariableRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getPositiveRouteId(req);
        if (!taskId) return error("任务编号无效", "INVALID_ID");
        const denied = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (denied) return denied;
        const info = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!info?.variableDictionary) return json({ dictionary: null });
        try {
            if (!info.excelFilePath) throw new AnalysisConflict("总体文件不存在", "SOURCE_CONFLICT", 409);
            const source = await readVariableSource(info.excelFilePath, info.fieldMapping);
            if (info.variableDictionary.source !== source.source || info.variableDictionary.revision !== info.variableRevision) throw new AnalysisConflict("字典来源已变化，请联系教师", "SOURCE_CONFLICT", 409);
            return json({ dictionary: validateDictionary(info.variableDictionary, source.rows, source.source) });
        } catch (cause) { return failure(cause); }
    },
};

export const savedAnalysisRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const id = getPositiveRouteId(req);
        if (!id) return error("任务编号无效", "INVALID_ID");
        try { return json(await listSavedAnalyses(auth.student.id, auth.student.classId, id)); }
        catch (cause) { return failure(cause); }
    },
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const id = getPositiveRouteId(req);
        if (!id) return error("任务编号无效", "INVALID_ID");
        try { return json(await createSavedAnalysis(auth.student.id, auth.student.classId, id, await parseBody(req), req.signal)); }
        catch (cause) { return failure(cause); }
    },
};
