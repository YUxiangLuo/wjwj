import { error, getPositiveRouteId, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { accessTeacherVariableDictionary } from "../topic/variable-dictionary-service";
import { getPrimaryTeacherIdOrThrow } from "./auth";

export const topicVariableDictionaryRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const topicId = getPositiveRouteId(req);
        if (!topicId) return error("Invalid ID", "INVALID_ID");
        const result = await accessTeacherVariableDictionary({ teacherId, topicId });
        if (!result.ok) return error(result.message, result.code, result.status);
        return json({ dictionary: result.dictionary, confirmed: result.confirmed, editable: result.editable });
    },
    async PUT(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const topicId = getPositiveRouteId(req);
        if (!topicId) return error("Invalid ID", "INVALID_ID");
        const body = await parseBody<{ dictionary?: unknown }>(req);
        const result = await accessTeacherVariableDictionary({ teacherId, topicId, input: body.dictionary });
        if (!result.ok) return error(result.message, result.code, result.status);
        return json({ dictionary: result.dictionary, confirmed: result.confirmed, editable: result.editable });
    },
};
