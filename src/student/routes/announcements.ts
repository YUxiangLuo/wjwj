import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { announcement } from "../../db/schema";
import { json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireAuth } from "./auth";

const announcementsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        return json(await db
            .select({ id: announcement.id, title: announcement.title, content: announcement.content, createdAt: announcement.createdAt })
            .from(announcement)
            .where(and(eq(announcement.status, 1), inArray(announcement.targetScope, ["all", "student"])))
            .orderBy(desc(announcement.createdAt)));
    },
};

export { announcementsRoutes };
