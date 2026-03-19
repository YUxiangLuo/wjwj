import { describe, expect, test, beforeEach } from "bun:test";
import { readReportDraft, writeReportDraft, clearReportDraft, getReportDraftKey } from "./draft-sync";

// Minimal localStorage mock for non-browser tests
const store = new Map<string, string>();
const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => {
    store.clear();
});

describe("getReportDraftKey", () => {
    test("returns key for valid taskId", () => {
        expect(getReportDraftKey(42)).toBe("student_report_draft_42");
    });

    test("returns null for null/undefined taskId", () => {
        expect(getReportDraftKey(null)).toBeNull();
        expect(getReportDraftKey(undefined)).toBeNull();
    });
});

describe("readReportDraft", () => {
    test("returns null when nothing stored", () => {
        expect(readReportDraft(1)).toBeNull();
    });

    test("returns stored draft", () => {
        store.set("student_report_draft_1", "hello");
        expect(readReportDraft(1)).toBe("hello");
    });
});

describe("writeReportDraft", () => {
    test("writes to localStorage", () => {
        writeReportDraft(1, "my report");
        expect(store.get("student_report_draft_1")).toBe("my report");
    });

    test("does nothing for null taskId", () => {
        writeReportDraft(null, "my report");
        expect(store.size).toBe(0);
    });
});

describe("clearReportDraft", () => {
    test("removes stored draft", () => {
        store.set("student_report_draft_1", "hello");
        clearReportDraft(1);
        expect(store.has("student_report_draft_1")).toBe(false);
    });

    test("does nothing for null taskId", () => {
        store.set("student_report_draft_1", "hello");
        clearReportDraft(null);
        expect(store.has("student_report_draft_1")).toBe(true);
    });
});
