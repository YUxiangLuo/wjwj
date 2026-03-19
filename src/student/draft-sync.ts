import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNetworkStatus } from "./use-network-status";

export type ReconnectSyncDecision = "synced" | "conflict" | "push_local" | "pull_server";

export interface DraftRestoreDecision<T> {
    draft: T | null;
    type: "none" | "restore";
}

interface DraftRestoreOptions<T> {
    rawDraft: string | null;
    parseDraft: (raw: string) => T | null;
    isMeaningfulDraft: (draft: T) => boolean;
    serverSnapshot: string;
}

interface ReconnectSyncOptions {
    lastSyncedSnapshot: string;
    localSnapshot: string;
    serverSnapshot: string;
}

interface UseDraftSyncOptions<T> {
    applyValue: (value: T) => void;
    currentValue: T;
    draftKey: string | null;
    initialServerValue: T;
    intervalMs?: number;
    debounceMs?: number;
    isMeaningfulDraft: (draft: T) => boolean;
    loadServerLatest: () => Promise<T | null>;
    parseDraft: (raw: string) => T | null;
    saveToServer: (value: T) => Promise<boolean>;
    serialize: (value: T) => string;
}

interface UseDraftSyncResult<T> {
    clearLocalDraft: () => void;
    discardPendingDraft: () => void;
    isOnline: boolean;
    keepLocalDraft: () => Promise<void>;
    keepServerDraft: () => void;
    networkNotice: string | null;
    pendingDraft: T | null;
    restoreDraftOpen: boolean;
    restorePendingDraft: () => void;
    saveNow: () => Promise<boolean>;
    serverConflictDraft: T | null;
    setRestoreDraftOpen: (open: boolean) => void;
    setSyncConflictOpen: (open: boolean) => void;
    syncConflictOpen: boolean;
}

function writeDraftSnapshot(draftKey: string | null, snapshot: string) {
    if (!draftKey) return;
    try {
        localStorage.setItem(draftKey, snapshot);
    } catch {
        // ignore write errors
    }
}

export function hasUnsavedChanges(currentSnapshot: string, lastSyncedSnapshot: string) {
    return currentSnapshot !== lastSyncedSnapshot;
}

export function decideDraftRestore<T>({
    rawDraft,
    parseDraft,
    isMeaningfulDraft,
    serverSnapshot,
}: DraftRestoreOptions<T>): DraftRestoreDecision<T> {
    if (!rawDraft) {
        return { type: "none", draft: null };
    }

    const draft = parseDraft(rawDraft);
    if (draft === null || !isMeaningfulDraft(draft)) {
        return { type: "none", draft: null };
    }

    if (rawDraft === serverSnapshot) {
        return { type: "none", draft: null };
    }

    return { type: "restore", draft };
}

export function decideReconnectSync({
    lastSyncedSnapshot,
    localSnapshot,
    serverSnapshot,
}: ReconnectSyncOptions): ReconnectSyncDecision {
    if (localSnapshot === serverSnapshot) return "synced";

    const localChanged = localSnapshot !== lastSyncedSnapshot;
    const serverChanged = serverSnapshot !== lastSyncedSnapshot;

    if (localChanged && serverChanged) return "conflict";
    if (localChanged) return "push_local";
    return "pull_server";
}

export function useDraftSync<T>({
    applyValue,
    currentValue,
    debounceMs = 3000,
    draftKey,
    initialServerValue,
    intervalMs = 30 * 1000,
    isMeaningfulDraft,
    loadServerLatest,
    parseDraft,
    saveToServer,
    serialize,
}: UseDraftSyncOptions<T>): UseDraftSyncResult<T> {
    const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<T | null>(null);
    const [syncConflictOpen, setSyncConflictOpen] = useState(false);
    const [serverConflictDraft, setServerConflictDraft] = useState<T | null>(null);
    const [localConflictDraft, setLocalConflictDraft] = useState<T | null>(null);

    const { isOnline, networkNotice, setNetworkNotice } = useNetworkStatus({
        offlineMessage: "网络已断开，数据将保存在本地",
        pauseAutoDismiss: syncConflictOpen,
    });

    const serverSnapshotRef = useRef("");
    const saveInFlightRef = useRef(false);
    const reconnectSyncingRef = useRef(false);
    const draftResolvedRef = useRef(false);

    const currentSnapshot = useMemo(() => serialize(currentValue), [currentValue, serialize]);
    const initialServerSnapshot = useMemo(() => serialize(initialServerValue), [initialServerValue, serialize]);

    useEffect(() => {
        serverSnapshotRef.current = initialServerSnapshot;
    }, [initialServerSnapshot]);

    useEffect(() => {
        draftResolvedRef.current = false;
        setPendingDraft(null);
        setRestoreDraftOpen(false);
    }, [draftKey]);

    useEffect(() => {
        if (!draftKey) {
            draftResolvedRef.current = true;
            return;
        }

        const decision = decideDraftRestore({
            rawDraft: localStorage.getItem(draftKey),
            parseDraft,
            isMeaningfulDraft,
            serverSnapshot: initialServerSnapshot,
        });

        if (decision.type === "restore") {
            setPendingDraft(decision.draft);
            setRestoreDraftOpen(true);
            return;
        }

        draftResolvedRef.current = true;
    }, [draftKey, initialServerSnapshot, isMeaningfulDraft, parseDraft]);

    useEffect(() => {
        if (!draftKey || !draftResolvedRef.current) return;
        writeDraftSnapshot(draftKey, currentSnapshot);
    }, [currentSnapshot, draftKey]);

    const saveNow = useCallback(async () => {
        if (!hasUnsavedChanges(currentSnapshot, serverSnapshotRef.current) || saveInFlightRef.current) {
            return false;
        }
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;

        saveInFlightRef.current = true;
        try {
            const success = await saveToServer(currentValue);
            if (success) {
                serverSnapshotRef.current = currentSnapshot;
                setNetworkNotice((prev) => (
                    prev === "网络已恢复，正在同步本地数据..."
                        ? "网络已恢复，本地草稿已同步到服务器"
                        : prev
                ));
            }
            return success;
        } finally {
            saveInFlightRef.current = false;
        }
    }, [currentSnapshot, currentValue, saveToServer, setNetworkNotice]);

    const saveNowRef = useRef(saveNow);
    useEffect(() => {
        saveNowRef.current = saveNow;
    }, [saveNow]);

    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            void saveNow();
        }, debounceMs);

        return () => {
            window.clearTimeout(debounceTimer);
        };
    }, [debounceMs, saveNow]);

    useEffect(() => {
        const intervalTimer = window.setInterval(() => {
            void saveNowRef.current();
        }, intervalMs);

        return () => {
            window.clearInterval(intervalTimer);
        };
    }, [intervalMs]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges(currentSnapshot, serverSnapshotRef.current)) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [currentSnapshot]);

    const syncAfterReconnect = useCallback(async () => {
        if (!draftKey || reconnectSyncingRef.current) return;

        reconnectSyncingRef.current = true;
        setNetworkNotice("网络已恢复，正在同步本地数据...");

        try {
            const lastSyncedSnapshot = serverSnapshotRef.current;
            const serverData = await loadServerLatest();

            if (serverData === null) {
                setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                return;
            }

            const serverSnapshot = serialize(serverData);
            const decision = decideReconnectSync({
                localSnapshot: currentSnapshot,
                serverSnapshot,
                lastSyncedSnapshot,
            });

            if (decision === "synced") {
                serverSnapshotRef.current = serverSnapshot;
                setNetworkNotice("网络已恢复，数据已同步");
                return;
            }

            if (decision === "conflict") {
                setLocalConflictDraft(currentValue);
                setServerConflictDraft(serverData);
                setSyncConflictOpen(true);
                setNetworkNotice("检测到本地与服务器草稿冲突，请选择保留版本");
                return;
            }

            if (decision === "push_local") {
                const success = await saveToServer(currentValue);
                if (success) {
                    serverSnapshotRef.current = currentSnapshot;
                    writeDraftSnapshot(draftKey, currentSnapshot);
                    setNetworkNotice("网络已恢复，本地草稿已同步到服务器");
                } else {
                    setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                }
                return;
            }

            applyValue(serverData);
            serverSnapshotRef.current = serverSnapshot;
            writeDraftSnapshot(draftKey, serverSnapshot);
            setNetworkNotice("检测到服务器有更新，已同步最新草稿");
        } catch {
            setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
        } finally {
            reconnectSyncingRef.current = false;
        }
    }, [applyValue, currentSnapshot, currentValue, draftKey, loadServerLatest, saveToServer, serialize, setNetworkNotice]);

    // Trigger reconnect sync when transitioning from offline to online
    const prevOnlineRef = useRef(isOnline);
    useEffect(() => {
        const wasOffline = !prevOnlineRef.current;
        prevOnlineRef.current = isOnline;
        if (isOnline && wasOffline) {
            void syncAfterReconnect();
        }
    }, [isOnline, syncAfterReconnect]);

    const clearLocalDraft = useCallback(() => {
        if (!draftKey) return;
        try {
            localStorage.removeItem(draftKey);
        } catch {
            // ignore write errors
        }
    }, [draftKey]);

    const discardPendingDraft = useCallback(() => {
        clearLocalDraft();
        draftResolvedRef.current = true;
        setPendingDraft(null);
        setRestoreDraftOpen(false);
    }, [clearLocalDraft]);

    const restorePendingDraft = useCallback(() => {
        if (pendingDraft !== null) {
            applyValue(pendingDraft);
        }
        draftResolvedRef.current = true;
        setRestoreDraftOpen(false);
    }, [applyValue, pendingDraft]);

    const keepServerDraft = useCallback(() => {
        if (serverConflictDraft === null) {
            setSyncConflictOpen(false);
            return;
        }

        const serverSnapshot = serialize(serverConflictDraft);
        applyValue(serverConflictDraft);
        serverSnapshotRef.current = serverSnapshot;
        writeDraftSnapshot(draftKey, serverSnapshot);
        setSyncConflictOpen(false);
        setNetworkNotice("已保留服务器草稿版本");
    }, [applyValue, draftKey, serverConflictDraft, serialize, setNetworkNotice]);

    const keepLocalDraft = useCallback(async () => {
        const localData = localConflictDraft ?? currentValue;
        const localSnapshot = serialize(localData);
        const success = await saveToServer(localData);

        if (success) {
            serverSnapshotRef.current = localSnapshot;
            writeDraftSnapshot(draftKey, localSnapshot);
            setNetworkNotice("已保留本地草稿并同步到服务器");
        } else {
            setNetworkNotice("保留本地草稿失败，请稍后重试");
        }

        setSyncConflictOpen(false);
    }, [currentValue, draftKey, localConflictDraft, saveToServer, serialize, setNetworkNotice]);

    return {
        clearLocalDraft,
        discardPendingDraft,
        isOnline,
        keepLocalDraft,
        keepServerDraft,
        networkNotice,
        pendingDraft,
        restoreDraftOpen,
        restorePendingDraft,
        saveNow,
        serverConflictDraft,
        setRestoreDraftOpen,
        setSyncConflictOpen,
        syncConflictOpen,
    };
}
