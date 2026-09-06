import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_PREFIX = "wj:experiment-draft";
const DEFAULT_SAVE_DELAY_MS = 600;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface ExperimentDraftEnvelope<T> {
    experimentVersion: number;
    updatedAt: string;
    data: T;
}

interface ExperimentDraftIdentity {
    experimentId: number | null | undefined;
    experimentVersion: number | null | undefined;
    stage: number;
}

function hasValidIdentity(identity: ExperimentDraftIdentity) {
    return Number.isInteger(identity.experimentId)
        && Number(identity.experimentId) > 0
        && Number.isInteger(identity.experimentVersion)
        && Number(identity.experimentVersion) >= 0
        && Number.isInteger(identity.stage)
        && identity.stage >= 1
        && identity.stage <= 4;
}

function draftKey(identity: ExperimentDraftIdentity) {
    if (!hasValidIdentity(identity)) return null;
    return `${DRAFT_PREFIX}:${identity.experimentId}:stage:${identity.stage}:version:${identity.experimentVersion}`;
}

function stageDraftPrefix(identity: ExperimentDraftIdentity) {
    if (!hasValidIdentity(identity)) return null;
    return `${DRAFT_PREFIX}:${identity.experimentId}:stage:${identity.stage}:version:`;
}

function getStorage() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

function pruneOlderExperimentDrafts(identity: ExperimentDraftIdentity, storage: Storage) {
    const prefix = stageDraftPrefix(identity);
    if (!prefix) return;
    const currentVersion = Number(identity.experimentVersion);
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const storedVersion = Number(key.slice(prefix.length));
        if (Number.isInteger(storedVersion) && storedVersion < currentVersion) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
}

export function readExperimentDraft<T>(identity: ExperimentDraftIdentity): T | null {
    const key = draftKey(identity);
    const storage = getStorage();
    if (!key || !storage) return null;

    try {
        pruneOlderExperimentDrafts(identity, storage);
        const raw = storage.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw) as Partial<ExperimentDraftEnvelope<T>>;
        const updatedAt = typeof envelope.updatedAt === "string" ? Date.parse(envelope.updatedAt) : Number.NaN;
        if (
            envelope.experimentVersion !== identity.experimentVersion
            || !("data" in envelope)
            || !Number.isFinite(updatedAt)
            || Date.now() - updatedAt > DRAFT_MAX_AGE_MS
        ) {
            storage.removeItem(key);
            return null;
        }
        return envelope.data ?? null;
    } catch {
        try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
        return null;
    }
}

export function clearAllExperimentDrafts() {
    const storage = getStorage();
    if (!storage) return;
    const keys: string[] = [];
    try {
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key?.startsWith(`${DRAFT_PREFIX}:`)) keys.push(key);
        }
        keys.forEach((key) => storage.removeItem(key));
    } catch {
        // Storage can be unavailable in privacy modes; logout must still work.
    }
}

export function writeExperimentDraft<T>(identity: ExperimentDraftIdentity, data: T) {
    const key = draftKey(identity);
    const storage = getStorage();
    if (!key || !storage) return false;

    try {
        const envelope: ExperimentDraftEnvelope<T> = {
            experimentVersion: Number(identity.experimentVersion),
            updatedAt: new Date().toISOString(),
            data,
        };
        storage.setItem(key, JSON.stringify(envelope));
        return true;
    } catch {
        return false;
    }
}

export function clearExperimentDraft(identity: ExperimentDraftIdentity) {
    const key = draftKey(identity);
    const storage = getStorage();
    if (!key || !storage) return;
    try {
        storage.removeItem(key);
    } catch {
        // Ignore unavailable storage and browser quota failures.
    }
}

export type DraftSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export function useExperimentDraft<T>({
    data,
    enabled = true,
    saveDelayMs = DEFAULT_SAVE_DELAY_MS,
    ...identity
}: ExperimentDraftIdentity & {
    data: T;
    enabled?: boolean;
    saveDelayMs?: number;
}) {
    const [status, setStatus] = useState<DraftSaveState>("idle");
    const suspendedRef = useRef(false);
    const latestRef = useRef({ data, enabled, identity });
    latestRef.current = { data, enabled, identity };
    // Compare content so status renders do not restart the debounce when callers
    // construct their payload inline.
    const content = JSON.stringify(data);
    const writerRef = useRef<{ key: string | null; raw: string | null; savedContent: string | null } | null>(null);
    const key = draftKey(identity);
    if (!writerRef.current || writerRef.current.key !== key) {
        let raw: string | null = null;
        let savedContent: string | null = null;
        try {
            raw = key ? getStorage()?.getItem(key) ?? null : null;
            if (raw) savedContent = JSON.stringify(JSON.parse(raw).data);
        } catch { /* Persist reports unavailable storage or an invalid draft. */ }
        writerRef.current = { key, raw, savedContent: savedContent === content ? content : null };
    }
    const persist = useCallback((requireCurrent = false): DraftSaveState | null => {
        const latest = latestRef.current;
        if (!latest.enabled || suspendedRef.current || !hasValidIdentity(latest.identity)) return null;
        const writer = writerRef.current;
        if (!writer?.key) return null;
        const nextContent = JSON.stringify(latest.data);
        // An untouched tab must not overwrite a newer tab when it hides/unmounts.
        if (!requireCurrent && writer.savedContent === nextContent) return "saved";
        const storage = getStorage();
        if (!storage) return "error";
        try {
            const current = storage.getItem(writer.key);
            if (current !== writer.raw) {
                if (!current || JSON.stringify(JSON.parse(current).data) !== nextContent) {
                    writer.savedContent = null;
                    return "conflict";
                }
                writer.raw = current;
                writer.savedContent = nextContent;
                return "saved";
            }
            const raw = JSON.stringify({ experimentVersion: Number(latest.identity.experimentVersion), updatedAt: new Date().toISOString(), data: latest.data });
            storage.setItem(writer.key, raw);
            writer.raw = raw;
            writer.savedContent = nextContent;
            return "saved";
        } catch { return "error"; }
    }, []);
    const retry = useCallback(() => {
        const next = persist();
        if (next) setStatus(next);
    }, [persist]);
    const save = useCallback((nextData: T) => {
        latestRef.current = { ...latestRef.current, data: nextData, enabled: true };
        const next = persist(true);
        if (next) setStatus(next);
        return next;
    }, [persist]);

    useEffect(() => {
        if (!enabled || suspendedRef.current || !hasValidIdentity(identity)) return;
        setStatus("saving");
        const timer = window.setTimeout(retry, saveDelayMs);
        return () => window.clearTimeout(timer);
    }, [content, enabled, identity.experimentId, identity.experimentVersion, identity.stage, saveDelayMs, retry]);

    useEffect(() => {
        const onHidden = () => { if (document.visibilityState === "hidden") retry(); };
        window.addEventListener("pagehide", retry);
        document.addEventListener("visibilitychange", onHidden);
        return () => {
            window.removeEventListener("pagehide", retry);
            document.removeEventListener("visibilitychange", onHidden);
            persist();
        };
    }, [persist, retry]);

    const clear = useCallback(() => {
        suspendedRef.current = true;
        setStatus("idle");
        clearExperimentDraft(identity);
        const latestIdentity = latestRef.current.identity;
        if (draftKey(latestIdentity) !== draftKey(identity)) clearExperimentDraft(latestIdentity);
    }, [identity.experimentId, identity.experimentVersion, identity.stage]);

    return { clear, status, retry, save };
}
