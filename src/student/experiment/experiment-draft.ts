import { useCallback, useEffect, useRef } from "react";

const DRAFT_PREFIX = "wj:experiment-draft";
const DEFAULT_SAVE_DELAY_MS = 600;

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
        if (envelope.experimentVersion !== identity.experimentVersion || !("data" in envelope)) {
            storage.removeItem(key);
            return null;
        }
        return envelope.data ?? null;
    } catch {
        storage.removeItem(key);
        return null;
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
    const suspendedRef = useRef(false);
    const latestRef = useRef({ data, enabled, identity });
    latestRef.current = { data, enabled, identity };

    useEffect(() => {
        suspendedRef.current = false;
    }, [identity.experimentId, identity.experimentVersion, identity.stage]);

    useEffect(() => {
        if (!enabled || suspendedRef.current || !hasValidIdentity(identity)) return;
        const timer = window.setTimeout(() => {
            if (!suspendedRef.current) writeExperimentDraft(identity, data);
        }, saveDelayMs);
        return () => window.clearTimeout(timer);
    }, [data, enabled, identity.experimentId, identity.experimentVersion, identity.stage, saveDelayMs]);

    useEffect(() => () => {
        const latest = latestRef.current;
        if (!latest.enabled || suspendedRef.current || !hasValidIdentity(latest.identity)) return;
        writeExperimentDraft(latest.identity, latest.data);
    }, []);

    return useCallback(() => {
        suspendedRef.current = true;
        clearExperimentDraft(identity);
    }, [identity.experimentId, identity.experimentVersion, identity.stage]);
}
