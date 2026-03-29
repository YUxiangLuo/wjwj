import { getRichTextPlainLength } from "@/utils/rich-text";

export interface ReportDraftRecord {
    basis: string;
    content: string;
}

export interface ResolveReportDraftOptions {
    basis: string;
    rawDraft: string | null;
    serverContent: string;
}

export interface ResolveReportDraftResult {
    content: string | null;
    type: "none" | "restore" | "clear";
}

export function getReportDraftKey(experimentId: number) {
    return `student_report_draft_exp_${experimentId}`;
}

export function getLegacyTaskReportDraftKey(taskId: number) {
    return `student_report_draft_${taskId}`;
}

export function hashSerializedValue(value: unknown) {
    const serialized = JSON.stringify(value ?? null);
    let hash = 0x811c9dc5;

    for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createReportDraftBasis(input: {
    samplePlan: unknown;
    samplingResults: unknown;
}) {
    // Keep the basis compact in localStorage while still invalidating drafts
    // when any upstream sample-plan or sampling-results payload changes.
    return JSON.stringify({
        samplePlanHash: hashSerializedValue(input.samplePlan),
        samplingResultsHash: hashSerializedValue(input.samplingResults),
    });
}

export function parseReportDraft(rawDraft: string | null): ReportDraftRecord | null {
    if (!rawDraft) return null;

    try {
        const parsed = JSON.parse(rawDraft) as Partial<ReportDraftRecord>;
        if (typeof parsed.basis !== "string" || typeof parsed.content !== "string") {
            return null;
        }
        return {
            basis: parsed.basis,
            content: parsed.content,
        };
    } catch {
        return null;
    }
}

export function resolveReportDraft({
    basis,
    rawDraft,
    serverContent,
}: ResolveReportDraftOptions): ResolveReportDraftResult {
    const draft = parseReportDraft(rawDraft);
    if (!draft) {
        return rawDraft ? { type: "clear", content: null } : { type: "none", content: null };
    }

    if (getRichTextPlainLength(draft.content) === 0) {
        return { type: "clear", content: null };
    }

    if (draft.basis !== basis) {
        return { type: "clear", content: null };
    }

    if (draft.content === serverContent) {
        return { type: "clear", content: null };
    }

    return {
        type: "restore",
        content: draft.content,
    };
}

function canUseLocalStorage() {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function clearReportDraft(experimentId: number | null | undefined) {
    if (!experimentId || !canUseLocalStorage()) return;

    try {
        window.localStorage.removeItem(getReportDraftKey(experimentId));
    } catch {
        // ignore storage errors
    }
}

export function clearLegacyTaskReportDraft(taskId: number | null | undefined) {
    if (!taskId || !canUseLocalStorage()) return;

    try {
        window.localStorage.removeItem(getLegacyTaskReportDraftKey(taskId));
    } catch {
        // ignore storage errors
    }
}

export function loadReportDraft(options: {
    basis: string;
    serverContent: string;
    experimentId: number | null | undefined;
}) {
    if (!options.experimentId || !canUseLocalStorage()) {
        return null;
    }

    const key = getReportDraftKey(options.experimentId);

    try {
        const resolution = resolveReportDraft({
            basis: options.basis,
            rawDraft: window.localStorage.getItem(key),
            serverContent: options.serverContent,
        });

        if (resolution.type === "clear") {
            window.localStorage.removeItem(key);
        }

        return resolution.type === "restore" ? resolution.content : null;
    } catch {
        return null;
    }
}

export function saveReportDraft(options: {
    basis: string;
    content: string;
    experimentId: number | null | undefined;
}) {
    if (!options.experimentId || !canUseLocalStorage()) return;

    if (getRichTextPlainLength(options.content) === 0) {
        clearReportDraft(options.experimentId);
        return;
    }

    try {
        window.localStorage.setItem(
            getReportDraftKey(options.experimentId),
            JSON.stringify({
                basis: options.basis,
                content: options.content,
            } satisfies ReportDraftRecord),
        );
    } catch {
        // ignore storage errors
    }
}
