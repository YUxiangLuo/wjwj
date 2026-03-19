import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal report draft — stage 4 only.
 *
 * Writes to localStorage on every content change (debounced).
 * On mount, silently restores from localStorage if the stored value
 * differs from the server snapshot.
 * Clears on explicit `clearDraft()` (after submit or upstream invalidation).
 *
 * No conflict dialogs, no reconnect sync, no cross-tab sync.
 */

const REPORT_DRAFT_KEY_PREFIX = "student_report_draft_";

export function getReportDraftKey(taskId: number | undefined | null): string | null {
    return taskId ? `${REPORT_DRAFT_KEY_PREFIX}${taskId}` : null;
}

export function readReportDraft(taskId: number | undefined | null): string | null {
    const key = getReportDraftKey(taskId);
    if (!key) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeReportDraft(taskId: number | undefined | null, content: string): void {
    const key = getReportDraftKey(taskId);
    if (!key) return;
    try {
        localStorage.setItem(key, content);
    } catch {
        // ignore write errors
    }
}

export function clearReportDraft(taskId: number | undefined | null): void {
    const key = getReportDraftKey(taskId);
    if (!key) return;
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

/**
 * React hook for stage 4 report draft.
 *
 * Returns the initial content (restored from localStorage if available)
 * and a `clearDraft` callback.
 */
export function useReportDraft(taskId: number | undefined | null, serverContent: string): {
    initialContent: string;
    clearDraft: () => void;
    persistDraft: (content: string) => void;
} {
    // Compute initial content once: prefer localStorage draft over server if different
    const [initialContent] = useState<string>(() => {
        const draft = readReportDraft(taskId);
        if (draft !== null && draft !== serverContent && draft.length > 0) {
            return draft;
        }
        return serverContent;
    });

    const taskIdRef = useRef(taskId);
    useEffect(() => { taskIdRef.current = taskId; }, [taskId]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const persistDraft = useCallback((content: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            writeReportDraft(taskIdRef.current, content);
        }, 1000);
    }, []);

    // Clear debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const clearDraft = useCallback(() => {
        clearReportDraft(taskId);
    }, [taskId]);

    return { initialContent, clearDraft, persistDraft };
}
