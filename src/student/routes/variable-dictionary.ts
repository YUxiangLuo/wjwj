import { error, getPositiveRouteId, json } from "@/server/http";
import type { RouteDefinition } from "@/server/route-types";
import { requireAuth } from "./auth";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { findStudentTaskSchedule } from "../experiment/task-info";
import { ensureTaskIsOpen } from "../experiment/task-timing";
import { readStudentVariableDictionary } from "../experiment/variable-dictionary";

export const studentVariableDictionaryRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getPositiveRouteId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const timingError = ensureTaskIsOpen(schedule?.openTime);
        if (timingError) return error(timingError.message, timingError.code, timingError.status);
        const result = await readStudentVariableDictionary(taskId, auth.student.classId);
        return result.ok ? json({ dictionary: result.dictionary }) : error(result.message, result.code, result.status);
    },
};
