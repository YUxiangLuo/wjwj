import { describe, expect, test } from "bun:test";
import {
    createReportDraftBasis,
    getReportDraftKey,
    getLegacyTaskReportDraftKey,
    parseReportDraft,
    resolveReportDraft,
} from "./draft-sync";

describe("parseReportDraft", () => {
    test("returns null for empty or invalid payloads", () => {
        expect(parseReportDraft(null)).toBeNull();
        expect(parseReportDraft("{invalid}")).toBeNull();
        expect(parseReportDraft(JSON.stringify({ basis: 1, content: "x" }))).toBeNull();
    });

    test("parses a valid report draft payload", () => {
        expect(parseReportDraft(JSON.stringify({
            basis: "snapshot",
            content: "<p>报告内容</p>",
        }))).toEqual({
            basis: "snapshot",
            content: "<p>报告内容</p>",
        });
    });
});

describe("resolveReportDraft", () => {
    test("restores a meaningful draft when basis still matches", () => {
        expect(resolveReportDraft({
            basis: "snapshot-a",
            rawDraft: JSON.stringify({
                basis: "snapshot-a",
                content: "<p>本地未提交报告</p>",
            }),
            serverContent: "",
        })).toEqual({
            type: "restore",
            content: "<p>本地未提交报告</p>",
        });
    });

    test("clears drafts when basis no longer matches upstream snapshot", () => {
        expect(resolveReportDraft({
            basis: "snapshot-b",
            rawDraft: JSON.stringify({
                basis: "snapshot-a",
                content: "<p>旧报告</p>",
            }),
            serverContent: "",
        })).toEqual({
            type: "clear",
            content: null,
        });
    });

    test("clears drafts when local content already matches server content", () => {
        expect(resolveReportDraft({
            basis: "snapshot-a",
            rawDraft: JSON.stringify({
                basis: "snapshot-a",
                content: "<p>服务器已有内容</p>",
            }),
            serverContent: "<p>服务器已有内容</p>",
        })).toEqual({
            type: "clear",
            content: null,
        });
    });

    test("clears empty rich text drafts", () => {
        expect(resolveReportDraft({
            basis: "snapshot-a",
            rawDraft: JSON.stringify({
                basis: "snapshot-a",
                content: "<p></p>",
            }),
            serverContent: "",
        })).toEqual({
            type: "clear",
            content: null,
        });
    });

    test("clears malformed storage payloads", () => {
        expect(resolveReportDraft({
            basis: "snapshot-a",
            rawDraft: "{invalid}",
            serverContent: "",
        })).toEqual({
            type: "clear",
            content: null,
        });
    });
});

test("createReportDraftBasis captures the stage 2 and 3 server snapshot", () => {
    const basis = createReportDraftBasis({
        samplePlan: { finalSampleSize: 120 },
        samplingResults: { simple: { completed: true, sampleCount: 120 } },
    });

    expect(basis).toMatch(/samplePlanHash/);
    expect(basis).toMatch(/samplingResultsHash/);
    expect(basis).not.toContain("finalSampleSize");
    expect(basis).not.toContain("sampleCount");
});

test("createReportDraftBasis stays compact while still tracking sampling data changes", () => {
    const basisWithRows = createReportDraftBasis({
        samplePlan: { finalSampleSize: 120 },
        samplingResults: {
            simple: {
                completed: true,
                sampleCount: 120,
                data: [
                    { id: 1, name: "Alice" },
                    { id: 2, name: "Bob" },
                ],
            },
        },
    });

    const basisWithDifferentRows = createReportDraftBasis({
        samplePlan: { finalSampleSize: 120 },
        samplingResults: {
            simple: {
                completed: true,
                sampleCount: 120,
                data: [
                    { id: 1, name: "Carol" },
                    { id: 2, name: "Bob" },
                ],
            },
        },
    });

    expect(basisWithRows).not.toContain("Alice");
    expect(basisWithRows).not.toContain("Bob");
    expect(basisWithRows).not.toBe(basisWithDifferentRows);
});

test("getReportDraftKey scopes drafts by experiment id and legacy task key", () => {
    expect(getReportDraftKey(42)).toBe("student_report_draft_exp_42");
    expect(getLegacyTaskReportDraftKey(42)).toBe("student_report_draft_42");
});
