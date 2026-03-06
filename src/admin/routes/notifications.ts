import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { notification } from "../../db/schema";
import { error, getRouteParam, json } from "../../server/http";
import { ADMIN_USER_TYPE, getAdminUser } from "./auth";

const notificationRoutes = {
    async GET(req: Request) {
        const adm = getAdminUser(req);
        const adminId = adm.id;

        const [countRow] = await db
            .select({ count: count() })
            .from(notification)
            .where(and(eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, adminId), eq(notification.isRead, 0)));

        const items = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
            })
            .from(notification)
            .where(and(eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, adminId)))
            .orderBy(desc(notification.createdAt))
            .limit(5);

        return json({
            count: countRow?.count ?? 0,
            items,
        });
    },
};

const notificationMarkReadRoutes = {
    async PUT(req: Request) {
        const adm = getAdminUser(req);
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);

        if (!id) {
            return error("无效的通知ID", "INVALID_ID");
        }

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.id, id), eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, adm.id)));

        return json({ success: true });
    },
};

const notificationReadAllRoutes = {
    async PUT(req: Request) {
        const adm = getAdminUser(req);
        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, adm.id), eq(notification.isRead, 0)));

        return json({ success: true });
    },
};

export { notificationMarkReadRoutes, notificationReadAllRoutes, notificationRoutes };
