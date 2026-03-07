import { useCallback, useState } from "react";

interface ApiSuccessResponse<T> {
    success: boolean;
    data?: T;
}

interface NotificationCenterSnapshot<TItem> {
    items: TItem[];
    unreadCount: number;
}

interface NotificationCenterLoadOptions {
    includeItems?: boolean;
}

interface UseNotificationCenterOptions<TItem, TResponse> {
    list: () => Promise<ApiSuccessResponse<TResponse>>;
    markOne: (id: number) => Promise<ApiSuccessResponse<{ success: boolean }>>;
    markAll: () => Promise<ApiSuccessResponse<{ success: boolean }>>;
    normalize: (data: TResponse) => NotificationCenterSnapshot<TItem>;
    getItemId: (item: TItem) => number;
    isItemRead: (item: TItem) => boolean;
    markItemRead: (item: TItem) => TItem;
    onLoaded?: (data: TResponse) => void;
}

export function applyNotificationRead<TItem>(
    items: TItem[],
    id: number,
    getItemId: (item: TItem) => number,
    isItemRead: (item: TItem) => boolean,
    markItemRead: (item: TItem) => TItem,
) {
    let unreadDelta = 0;
    const nextItems = items.map((item) => {
        if (getItemId(item) !== id) return item;
        if (!isItemRead(item)) unreadDelta = 1;
        return markItemRead(item);
    });

    return { items: nextItems, unreadDelta };
}

export function applyAllNotificationsRead<TItem>(items: TItem[], markItemRead: (item: TItem) => TItem) {
    return items.map((item) => markItemRead(item));
}

export function useNotificationCenter<TItem, TResponse>(options: UseNotificationCenterOptions<TItem, TResponse>) {
    const {
        list,
        markOne,
        markAll,
        normalize,
        getItemId,
        isItemRead,
        markItemRead,
        onLoaded,
    } = options;
    const [items, setItems] = useState<TItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const load = useCallback(async (loadOptions?: NotificationCenterLoadOptions) => {
        const includeItems = loadOptions?.includeItems ?? true;
        setLoading(true);
        try {
            const res = await list();
            if (res.success && res.data) {
                const snapshot = normalize(res.data);
                setUnreadCount(snapshot.unreadCount);
                if (includeItems) {
                    setItems(snapshot.items);
                }
                onLoaded?.(res.data);
            }
        } finally {
            setLoading(false);
        }
    }, [list, normalize, onLoaded]);

    const open = useCallback(async () => {
        await load({ includeItems: true });
        setIsOpen(true);
    }, [load]);

    const markAsRead = useCallback(async (id: number) => {
        const res = await markOne(id);
        if (!res.success) return false;

        setItems((prev) => {
            const next = applyNotificationRead(prev, id, getItemId, isItemRead, markItemRead);
            setUnreadCount((current) => Math.max(current - next.unreadDelta, 0));
            return next.items;
        });
        return true;
    }, [getItemId, isItemRead, markItemRead, markOne]);

    const markAllAsRead = useCallback(async () => {
        const res = await markAll();
        if (!res.success) return false;

        setItems((prev) => applyAllNotificationsRead(prev, markItemRead));
        setUnreadCount(0);
        return true;
    }, [markAll, markItemRead]);

    return {
        items,
        unreadCount,
        loading,
        isOpen,
        setIsOpen,
        load,
        open,
        markAsRead,
        markAllAsRead,
    };
}