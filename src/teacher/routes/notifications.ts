import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { notification } from "../../db/schema";
import { error, getRouteParam, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireTeacherAuth } from "./auth";

const teacherNotificationsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        const items = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
                relatedType: notification.relatedType,
                relatedId: notification.relatedId,
            })
            .from(notification)
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id)))
            .orderBy(desc(notification.createdAt))
            .limit(50);

        const [unreadCount] = await db
            .select({ count: count() })
            .from(notification)
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id), eq(notification.isRead, 0)));

        return json({ notifications: items, unreadCount: unreadCount?.count ?? 0 });
    }
};

const teacherNotificationReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        await db.update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.id, id), eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id)));

        return json({ success: true });
    }
};

const teacherNotificationReadAllRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        await db.update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id), eq(notification.isRead, 0)));

        return json({ success: true });
    }
};

export { teacherNotificationReadAllRoutes, teacherNotificationReadRoutes, teacherNotificationsRoutes };
