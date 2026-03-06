import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { announcement, announcementRead, notification } from "../../db/schema";
import { error, getRouteParam, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getTeacherUser } from "./auth";

const teacherNotificationsRoutes: RouteDefinition = {
    async GET(req) {
        const currentUser = getTeacherUser(req);

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
        const currentUser = getTeacherUser(req);

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
        const currentUser = getTeacherUser(req);

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        await db.update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id), eq(notification.isRead, 0)));

        return json({ success: true });
    }
};

export { teacherNotificationReadAllRoutes, teacherNotificationReadRoutes, teacherNotificationsRoutes, teacherAnnouncementsRoutes, teacherAnnouncementReadRoutes };

const teacherAnnouncementsRoutes: RouteDefinition = {
    async GET(req) {
        const currentUser = getTeacherUser(req);

        const userType = currentUser.type === "teacher" ? 2 : 3;

        const items = await db
            .select({
                id: announcement.id,
                title: announcement.title,
                content: announcement.content,
                createdAt: announcement.createdAt,
            })
            .from(announcement)
            .where(eq(announcement.status, 1))
            .orderBy(desc(announcement.createdAt))
            .limit(20);

        if (items.length === 0) {
            return json({ announcements: [], unreadCount: 0 });
        }

        const readRows = await db
            .select({ announcementId: announcementRead.announcementId })
            .from(announcementRead)
            .where(
                and(
                    eq(announcementRead.userType, userType),
                    eq(announcementRead.userId, currentUser.id),
                    sql`${announcementRead.announcementId} IN (${sql.join(items.map(i => sql`${i.id}`), sql`, `)})`
                )
            );

        const readSet = new Set(readRows.map(r => r.announcementId));

        const announcements = items.map(item => ({
            ...item,
            isRead: readSet.has(item.id) ? 1 : 0,
        }));

        const unreadCount = announcements.filter(a => a.isRead === 0).length;

        return json({ announcements, unreadCount });
    }
};

const teacherAnnouncementReadRoutes: RouteDefinition = {
    async PUT(req) {
        const currentUser = getTeacherUser(req);

        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const userType = currentUser.type === "teacher" ? 2 : 3;

        // Idempotent insert using INSERT IGNORE (unique index will prevent duplicates)
        await db.execute(
            sql`INSERT IGNORE INTO announcement_read (announcement_id, user_type, user_id) VALUES (${id}, ${userType}, ${currentUser.id})`
        );

        return json({ success: true });
    }
};
