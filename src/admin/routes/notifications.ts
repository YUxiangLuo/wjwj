import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { notification } from "../../db/schema";
import { error, json } from "../../server/http";
import { ADMIN_USER_TYPE, requireAdminAuth } from "./auth";

const notificationRoutes = {
    async GET(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const adminId = auth.admin!.id;

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
            sessionExpiresAt: auth.session?.expiresAt ?? null,
        });
    },
};

const notificationMarkReadRoutes = {
    async PUT(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的通知ID", "INVALID_ID");
        }

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.id, id), eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, auth.admin!.id)));

        return json({ success: true });
    },
};

const notificationReadAllRoutes = {
    async PUT(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, ADMIN_USER_TYPE), eq(notification.receiverId, auth.admin!.id), eq(notification.isRead, 0)));

        return json({ success: true });
    },
};

export { notificationMarkReadRoutes, notificationReadAllRoutes, notificationRoutes };
