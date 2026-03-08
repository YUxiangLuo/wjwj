import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { semester } from "../../db/schema";
import { error, getRouteParam, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";

const semesterUpdateRoutes: RouteDefinition = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        const body = await parseBody<{ name?: string }>(req);
        const name = body.name?.trim();

        if (!name) {
            return error("学期名称不能为空", "VALIDATION_ERROR");
        }

        if (name.length > 20) {
            return error("学期名称不能超过20个字符", "VALIDATION_ERROR");
        }

        const [existing] = await db
            .select()
            .from(semester)
            .where(and(eq(semester.name, name), sql`${semester.id} <> ${id}`));

        if (existing) {
            return error("学期名称已存在", "DUPLICATE_NAME");
        }

        await db.update(semester).set({ name }).where(eq(semester.id, id));

        return json({ success: true });
    },
};

export { semesterUpdateRoutes };
