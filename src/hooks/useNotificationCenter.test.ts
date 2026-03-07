import { expect, test } from "bun:test";
import { applyAllNotificationsRead, applyNotificationRead } from "./useNotificationCenter";

type Notification = {
    id: number;
    isRead: number;
    title: string;
};

const notifications: Notification[] = [
    { id: 1, isRead: 0, title: "A" },
    { id: 2, isRead: 1, title: "B" },
];

test("applyNotificationRead marks one unread item and reports unread delta", () => {
    const result = applyNotificationRead(
        notifications,
        1,
        (item) => item.id,
        (item) => item.isRead === 1,
        (item) => ({ ...item, isRead: 1 }),
    );

    expect(result.unreadDelta).toBe(1);
    expect(result.items).toEqual([
        { id: 1, isRead: 1, title: "A" },
        { id: 2, isRead: 1, title: "B" },
    ]);
});

test("applyNotificationRead leaves unread delta at zero for already read items", () => {
    const result = applyNotificationRead(
        notifications,
        2,
        (item) => item.id,
        (item) => item.isRead === 1,
        (item) => ({ ...item, isRead: 1 }),
    );

    expect(result.unreadDelta).toBe(0);
    expect(result.items[1]).toEqual({ id: 2, isRead: 1, title: "B" });
});

test("applyAllNotificationsRead marks every notification as read", () => {
    expect(applyAllNotificationsRead(notifications, (item) => ({ ...item, isRead: 1 }))).toEqual([
        { id: 1, isRead: 1, title: "A" },
        { id: 2, isRead: 1, title: "B" },
    ]);
});
