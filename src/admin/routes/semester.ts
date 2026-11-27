import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { semester } from "../../db/schema";
import { error, getPositiveRouteId, json, parseBody, stringValue } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";

// All semester mutations (create, rename, set-current, delete, and class creation
// under a semester) share this short transaction lock ("WJ" / "SE").
export async function lockSemesterMutations(tx: Pick<typeof db, "execute">) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${0x574a}, ${0x5345})`);
}

const semesterUpdateRoutes: RouteDefinition = {
    async PUT(req: Request) {
        const id = getPositiveRouteId(req);

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        const body = await parseBody<{ name?: string }>(req);
        const name = stringValue(body.name).trim();

        if (!name) {
            return error("学期名称不能为空", "VALIDATION_ERROR");
        }

        if (name.length > 20) {
            return error("学期名称不能超过20个字符", "VALIDATION_ERROR");
        }

        return db.transaction(async (tx) => {
            await lockSemesterMutations(tx);

            const [existing] = await tx
                .select({ id: semester.id })
                .from(semester)
                .where(and(eq(semester.name, name), sql`${semester.id} <> ${id}`));

            if (existing) {
                return error("学期名称已存在", "DUPLICATE_NAME", 409);
            }

            const updated = await tx
                .update(semester)
                .set({ name, updatedAt: new Date() })
                .where(eq(semester.id, id))
                .returning({ id: semester.id });

            if (!updated.length) {
                return error("学期不存在", "NOT_FOUND", 404);
            }

            return json({ success: true });
        });
    },
};

export { semesterUpdateRoutes };
