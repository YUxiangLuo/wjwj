import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act, createElement } from "react";
import { applyAllNotificationsRead, applyNotificationRead } from "./useNotificationCenter";
import { useNotificationCenter } from "./useNotificationCenter";
import { installDomGlobals } from "@/test-utils/dom";

type Notification = {
    id: number;
    isRead: number;
    title: string;
};

const notifications: Notification[] = [
    { id: 1, isRead: 0, title: "A" },
    { id: 2, isRead: 1, title: "B" },
];

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

function NotificationCenterProbe(props: {
    list: () => Promise<{ success: boolean; data?: { notifications: Notification[]; unreadCount: number } }>;
}) {
    const notificationCenter = useNotificationCenter({
        list: props.list,
        markOne: async () => ({ success: true, data: { success: true } }),
        markAll: async () => ({ success: true, data: { success: true } }),
        normalize: (data: { notifications: Notification[]; unreadCount: number }) => ({
            items: data.notifications,
            unreadCount: data.unreadCount,
        }),
        getItemId: (item: Notification) => item.id,
        isItemRead: (item: Notification) => item.isRead === 1,
        markItemRead: (item: Notification) => ({ ...item, isRead: 1 }),
    });

    return createElement(
        "div",
        null,
        createElement("button", {
            "data-testid": "open-notifications",
            onClick: () => { void notificationCenter.open(); },
        }, "open"),
        createElement("div", { "data-testid": "notification-open-state" }, notificationCenter.isOpen ? "open" : "closed"),
        createElement("div", { "data-testid": "notification-loading-state" }, notificationCenter.loading ? "loading" : "idle"),
        createElement("div", { "data-testid": "notification-count" }, String(notificationCenter.items.length)),
    );
}

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

test("open marks the notification center as open before the first load resolves", async () => {
    let resolveList: ((value: { success: boolean; data: { notifications: Notification[]; unreadCount: number } }) => void) | null = null;
    const list = () => new Promise<{ success: boolean; data: { notifications: Notification[]; unreadCount: number } }>((resolve) => {
        resolveList = resolve;
    });

    const view = render(createElement(NotificationCenterProbe, { list }));

    await act(async () => {
        view.getByTestId("open-notifications").click();
    });

    expect(view.getByTestId("notification-open-state").textContent).toBe("open");
    expect(view.getByTestId("notification-loading-state").textContent).toBe("loading");

    await act(async () => {
        resolveList?.({
            success: true,
            data: {
                notifications,
                unreadCount: 1,
            },
        });
    });

    await waitFor(() => {
        expect(view.getByTestId("notification-loading-state").textContent).toBe("idle");
        expect(view.getByTestId("notification-count").textContent).toBe("2");
    });
});
