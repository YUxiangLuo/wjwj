import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { announcement, announcementRead, notification } from "../../db/schema";
import { error, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireAuth } from "./auth";

function getPathParam(req: Request, position: number): string {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    return parts[parts.length - position] ?? "";
}

const notificationsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notifications = await db
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
            .where(and(eq(notification.receiverType, 4), eq(notification.receiverId, currentStudent.id)))
            .orderBy(desc(notification.createdAt))
            .limit(50);

        const [unreadCount] = await db
            .select({ count: count() })
            .from(notification)
            .where(and(eq(notification.receiverType, 4), eq(notification.receiverId, currentStudent.id), eq(notification.isRead, 0)));

        return json({
            notifications,
            unreadCount: unreadCount?.count ?? 0,
        });
    },
};

const notificationReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notificationId = parseInt(getPathParam(req, 2));
        if (!notificationId) {
            return error("无效的通知ID", "INVALID_ID");
        }

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.id, notificationId), eq(notification.receiverType, 4), eq(notification.receiverId, currentStudent.id)));

        return json({ success: true });
    },
};

const notificationReadAllRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, 4), eq(notification.receiverId, currentStudent.id), eq(notification.isRead, 0)));

        return json({ success: true });
    },
};

const announcementsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const announcements = await db
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

        const announcementIds = announcements.map((a) => a.id);
        const readRecords =
            announcementIds.length > 0
                ? await db
                    .select({ announcementId: announcementRead.announcementId })
                    .from(announcementRead)
                    .where(
                        and(
                            eq(announcementRead.userType, 4),
                            eq(announcementRead.userId, currentStudent.id),
                            sql`${announcementRead.announcementId} IN (${sql.join(announcementIds, sql`, `)})`
                        )
                    )
                : [];

        const readSet = new Set(readRecords.map((r) => r.announcementId));

        const result = announcements.map((a) => ({
            ...a,
            isRead: readSet.has(a.id),
        }));

        return json(result);
    },
};

const announcementReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const announcementId = parseInt(getPathParam(req, 2));
        if (!announcementId) {
            return error("无效的公告ID", "INVALID_ID");
        }

        const [existing] = await db
            .select()
            .from(announcementRead)
            .where(
                and(
                    eq(announcementRead.announcementId, announcementId),
                    eq(announcementRead.userType, 4),
                    eq(announcementRead.userId, currentStudent.id)
                )
            );

        if (!existing) {
            await db.insert(announcementRead).values({
                announcementId,
                userType: 4,
                userId: currentStudent.id,
            });
        }

        return json({ success: true });
    },
};

export {
    announcementReadRoutes,
    announcementsRoutes,
    notificationReadAllRoutes,
    notificationReadRoutes,
    notificationsRoutes,
};
