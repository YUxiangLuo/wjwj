import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    clearExperimentDrafts,
    clearLegacyExperimentDrafts,
    clearReportDraft,
    getReportDraftKey,
    readReportDraft,
    writeReportDraft,
} from "./draft-sync";

const taskId = 40;

function createStorage() {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    } as Storage;
}

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: createStorage(),
    });
});

afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
    });
});

describe("report draft helpers", () => {
    test("read/write/clear report draft use the stage 4 key", () => {
        expect(getReportDraftKey(taskId)).toBe("student_report_draft_40");

        writeReportDraft(taskId, "draft-content");
        expect(readReportDraft(taskId)).toBe("draft-content");

        clearReportDraft(taskId);
        expect(readReportDraft(taskId)).toBeNull();
    });
});

describe("clearExperimentDrafts", () => {
    test("clears downstream drafts from the requested stage", () => {
        localStorage.setItem(`student_questionnaire_draft_${taskId}`, "q");
        localStorage.setItem(`student_sample_plan_draft_${taskId}`, "p");
        localStorage.setItem(`student_sampling_params_${taskId}`, "s");
        localStorage.setItem(`student_report_draft_${taskId}`, "r");

        clearExperimentDrafts(taskId, { fromStage: 3 });

        expect(localStorage.getItem(`student_questionnaire_draft_${taskId}`)).toBe("q");
        expect(localStorage.getItem(`student_sample_plan_draft_${taskId}`)).toBe("p");
        expect(localStorage.getItem(`student_sampling_params_${taskId}`)).toBeNull();
        expect(localStorage.getItem(`student_report_draft_${taskId}`)).toBeNull();
    });

    test("legacy cleanup keeps stage 4 draft intact", () => {
        localStorage.setItem(`student_questionnaire_draft_${taskId}`, "q");
        localStorage.setItem(`student_sample_plan_draft_${taskId}`, "p");
        localStorage.setItem(`student_sampling_params_${taskId}`, "s");
        localStorage.setItem(`student_report_draft_${taskId}`, "r");

        clearLegacyExperimentDrafts(taskId);

        expect(localStorage.getItem(`student_questionnaire_draft_${taskId}`)).toBeNull();
        expect(localStorage.getItem(`student_sample_plan_draft_${taskId}`)).toBeNull();
        expect(localStorage.getItem(`student_sampling_params_${taskId}`)).toBeNull();
        expect(localStorage.getItem(`student_report_draft_${taskId}`)).toBe("r");
    });
});
