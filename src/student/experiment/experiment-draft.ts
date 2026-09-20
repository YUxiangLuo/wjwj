import { useCallback, useEffect } from "react";

const DRAFT_PREFIX = "wj:experiment-draft";
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
    baseline,
    enabled = true,
    ...identity
}: ExperimentDraftIdentity & {
    data: T;
    baseline: T;
    enabled?: boolean;
}) {
    const content = JSON.stringify(data);
    const baselineContent = JSON.stringify(baseline);

    useEffect(() => {
        if (!enabled || !hasValidIdentity(identity)) return;
        if (content === baselineContent) clearExperimentDraft(identity);
        else if (JSON.stringify(readExperimentDraft<T>(identity)) !== content) writeExperimentDraft(identity, data);
    }, [baselineContent, content, enabled, identity.experimentId, identity.experimentVersion, identity.stage]);

    const clear = useCallback(() => {
        clearExperimentDraft(identity);
    }, [identity.experimentId, identity.experimentVersion, identity.stage]);

    return { clear };
}
