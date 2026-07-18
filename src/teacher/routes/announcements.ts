import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { announcement } from "../../db/schema";
import { json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";

const teacherAnnouncementsRoutes: RouteDefinition = {
    async GET() {
        return json(await db
            .select({ id: announcement.id, title: announcement.title, content: announcement.content, createdAt: announcement.createdAt })
            .from(announcement)
            .where(and(eq(announcement.status, 1), inArray(announcement.targetScope, ["all", "teacher"])))
            .orderBy(desc(announcement.createdAt)));
    },
};

export { teacherAnnouncementsRoutes };
