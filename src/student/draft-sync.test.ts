import { describe, expect, test } from "bun:test";
import { clearExperimentDrafts, decideDraftRestore, decideReconnectSync, hasUnsavedChanges } from "./draft-sync";

describe("decideDraftRestore", () => {
    const parseDraft = (raw: string) => {
        try {
            return JSON.parse(raw) as { title?: string };
        } catch {
            return null;
        }
    };

    test("ignores empty or invalid drafts", () => {
        expect(decideDraftRestore({
            rawDraft: null,
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({ type: "none", draft: null });

        expect(decideDraftRestore({
            rawDraft: "{invalid}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({ type: "none", draft: null });
    });

    test("does not prompt when local and server snapshots match", () => {
        expect(decideDraftRestore({
            rawDraft: "{\"title\":\"same\"}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"same\"}",
        })).toEqual({ type: "none", draft: null });
    });

    test("prompts when a meaningful local draft differs from server", () => {
        expect(decideDraftRestore({
            rawDraft: "{\"title\":\"local\"}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({
            type: "restore",
            draft: { title: "local" },
        });
    });
});

describe("decideReconnectSync", () => {
    test("prefers no-op when local and server are already aligned", () => {
        expect(decideReconnectSync({
            localSnapshot: "same",
            serverSnapshot: "same",
            lastSyncedSnapshot: "old",
        })).toBe("synced");
    });

    test("detects divergent local and server changes", () => {
        expect(decideReconnectSync({
            localSnapshot: "local",
            serverSnapshot: "server",
            lastSyncedSnapshot: "old",
        })).toBe("conflict");
    });

    test("pushes local changes when only local changed", () => {
        expect(decideReconnectSync({
            localSnapshot: "local",
            serverSnapshot: "old",
            lastSyncedSnapshot: "old",
        })).toBe("push_local");
    });

    test("pulls server changes when local stayed at last synced snapshot", () => {
        expect(decideReconnectSync({
            localSnapshot: "old",
            serverSnapshot: "server",
            lastSyncedSnapshot: "old",
        })).toBe("pull_server");
    });
});

test("hasUnsavedChanges compares current and last synced snapshots", () => {
    expect(hasUnsavedChanges("current", "server")).toBe(true);
    expect(hasUnsavedChanges("same", "same")).toBe(false);
});

// ---------------------------------------------------------------------------
// clearExperimentDrafts
// ---------------------------------------------------------------------------

// Provide a minimal localStorage shim for Bun's test environment
const storage = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
            clear: () => storage.clear(),
        },
        configurable: true,
    });
}

describe("clearExperimentDrafts", () => {
    const TASK_ID = 42;
    const ALL_KEYS = [
        `student_questionnaire_draft_${TASK_ID}`,
        `student_sample_plan_draft_${TASK_ID}`,
        `student_sampling_params_${TASK_ID}`,
        `student_report_draft_${TASK_ID}`,
    ];

    function seedDrafts() {
        for (const key of ALL_KEYS) {
            localStorage.setItem(key, "draft_data");
        }
    }

    test("clears all drafts when no fromStage specified", () => {
        seedDrafts();
        clearExperimentDrafts(TASK_ID);
        for (const key of ALL_KEYS) {
            expect(localStorage.getItem(key)).toBeNull();
        }
    });

    test("clears only downstream drafts when fromStage is 2", () => {
        seedDrafts();
        clearExperimentDrafts(TASK_ID, { fromStage: 2 });

        // Stage 1 draft should survive
        expect(localStorage.getItem(ALL_KEYS[0]!)).toBe("draft_data");
        // Stages 2-4 should be cleared
        expect(localStorage.getItem(ALL_KEYS[1]!)).toBeNull();
        expect(localStorage.getItem(ALL_KEYS[2]!)).toBeNull();
        expect(localStorage.getItem(ALL_KEYS[3]!)).toBeNull();
    });

    test("clears stage 3 and 4 drafts when fromStage is 3", () => {
        seedDrafts();
        clearExperimentDrafts(TASK_ID, { fromStage: 3 });

        expect(localStorage.getItem(ALL_KEYS[0]!)).toBe("draft_data");
        expect(localStorage.getItem(ALL_KEYS[1]!)).toBe("draft_data");
        expect(localStorage.getItem(ALL_KEYS[2]!)).toBeNull();
        expect(localStorage.getItem(ALL_KEYS[3]!)).toBeNull();
    });

    test("clears only stage 4 draft when fromStage is 4", () => {
        seedDrafts();
        clearExperimentDrafts(TASK_ID, { fromStage: 4 });

        expect(localStorage.getItem(ALL_KEYS[0]!)).toBe("draft_data");
        expect(localStorage.getItem(ALL_KEYS[1]!)).toBe("draft_data");
        expect(localStorage.getItem(ALL_KEYS[2]!)).toBe("draft_data");
        expect(localStorage.getItem(ALL_KEYS[3]!)).toBeNull();
    });
});
