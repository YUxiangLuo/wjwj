import { error, getPositiveRouteId, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getTeacherVariableDictionary, putTeacherVariableDictionary } from "../topic/variable-dictionary-service";
import { getPrimaryTeacherIdOrThrow } from "./auth";

export const topicVariableRoutes: RouteDefinition = {
    async GET(req) {
        const id = getPositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");
        const result = await getTeacherVariableDictionary({ teacherId: getPrimaryTeacherIdOrThrow(req), topicId: id });
        if (!result.ok) return error(result.message, result.code, result.status);
        const { ok: _, ...data } = result;
        return json(data);
    },
    async PUT(req) {
        const id = getPositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");
        const result = await putTeacherVariableDictionary({
            teacherId: getPrimaryTeacherIdOrThrow(req), topicId: id, body: await parseBody<Record<string, unknown>>(req),
        });
        if (!result.ok) return error(result.message, result.code, result.status);
        return json({ success: true, revision: result.revision });
    },
};
