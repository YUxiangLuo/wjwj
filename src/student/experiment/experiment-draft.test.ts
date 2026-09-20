import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import {
    clearExperimentDraft,
    readExperimentDraft,
    writeExperimentDraft,
    useExperimentDraft,
} from "./experiment-draft";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals().restore;
    localStorage.clear();
});

afterEach(() => {
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
});

test("experiment draft round-trips for the same experiment version", () => {
    const identity = { experimentId: 18, experimentVersion: 7, stage: 1 };
    const data = { questionnaire: { title: "课堂调查", questions: [] }, step: 2 };

    expect(writeExperimentDraft(identity, data)).toBe(true);
    expect(readExperimentDraft<typeof data>(identity)).toEqual(data);
});

test("stale experiment drafts are discarded after the server version changes", () => {
    const oldIdentity = { experimentId: 18, experimentVersion: 7, stage: 4 };
    expect(writeExperimentDraft(oldIdentity, { reportContent: "旧草稿" })).toBe(true);

    expect(readExperimentDraft({ ...oldIdentity, experimentVersion: 8 })).toBeNull();
    expect(readExperimentDraft(oldIdentity)).toBeNull();
});

test("clearing a draft only removes the selected stage", () => {
    const first = { experimentId: 18, experimentVersion: 7, stage: 1 };
    const fourth = { experimentId: 18, experimentVersion: 7, stage: 4 };
    writeExperimentDraft(first, { title: "问卷" });
    writeExperimentDraft(fourth, { reportContent: "报告" });

    clearExperimentDraft(first);

    expect(readExperimentDraft(first)).toBeNull();
    expect(readExperimentDraft<{ reportContent: string }>(fourth)).toEqual({ reportContent: "报告" });
});

test("expired and malformed drafts are removed instead of restored", () => {
    const expired = { experimentId: 88, experimentVersion: 1, stage: 4 };
    const expiredKey = "wj:experiment-draft:88:stage:4:version:1";
    localStorage.setItem(expiredKey, JSON.stringify({
        experimentVersion: 1,
        updatedAt: "2020-01-01T00:00:00.000Z",
        data: { report: "expired" },
    }));
    const malformed = { experimentId: 89, experimentVersion: 1, stage: 4 };
    const malformedKey = "wj:experiment-draft:89:stage:4:version:1";
    localStorage.setItem(malformedKey, "not-json");

    expect(readExperimentDraft(expired)).toBeNull();
    expect(readExperimentDraft(malformed)).toBeNull();
    expect(localStorage.getItem(expiredKey)).toBeNull();
    expect(localStorage.getItem(malformedKey)).toBeNull();
});

test("the hook stores only values that differ from the server baseline", async () => {
    const identity = { experimentId: 21, experimentVersion: 3, stage: 4 };
    const hook = renderHook(
        ({ report }) => useExperimentDraft({
            ...identity,
            data: { report },
            baseline: { report: "服务器报告" },
        }),
        { initialProps: { report: "服务器报告" } },
    );
    expect(readExperimentDraft(identity)).toBeNull();

    hook.rerender({ report: "本机修改" });
    await waitFor(() => expect(readExperimentDraft<{ report: string }>(identity)).toEqual({ report: "本机修改" }));

    hook.rerender({ report: "服务器报告" });
    await waitFor(() => expect(readExperimentDraft(identity)).toBeNull());
});

test("the latest local edit wins without a cross-tab conflict state", async () => {
    const identity = { experimentId: 22, experimentVersion: 4, stage: 4 };
    const first = renderHook(() => useExperimentDraft({ ...identity, data: { report: "第一页" }, baseline: { report: "服务器" } }));
    await waitFor(() => expect(readExperimentDraft<{ report: string }>(identity)?.report).toBe("第一页"));
    const second = renderHook(() => useExperimentDraft({ ...identity, data: { report: "第二页" }, baseline: { report: "服务器" } }));

    await waitFor(() => expect(readExperimentDraft<{ report: string }>(identity)?.report).toBe("第二页"));
    first.unmount();
    second.unmount();
    expect(readExperimentDraft<{ report: string }>(identity)?.report).toBe("第二页");
});

test("successful completion remains cleared after the editor unmounts", async () => {
    const identity = { experimentId: 23, experimentVersion: 4, stage: 4 };
    const hook = renderHook(() => useExperimentDraft({
        ...identity,
        data: { reportContent: "已提交内容" },
        baseline: { reportContent: "" },
    }));
    await waitFor(() => expect(readExperimentDraft(identity)).not.toBeNull());

    act(() => hook.result.current.clear());
    hook.unmount();

    expect(readExperimentDraft(identity)).toBeNull();
});

test("unavailable storage never blocks editing", () => {
    const identity = { experimentId: 24, experimentVersion: 1, stage: 4 };
    const storage = localStorage;
    globalThis.localStorage = {
        get length() { return 0; },
        key: () => null,
        getItem: () => null,
        setItem: () => { throw new Error("quota"); },
        removeItem: () => {},
        clear: () => {},
    };
    try {
        const hook = renderHook(() => useExperimentDraft({ ...identity, data: { report: "继续编辑" }, baseline: { report: "" } }));
        expect(readExperimentDraft(identity)).toBeNull();
        hook.unmount();
    } finally {
        globalThis.localStorage = storage;
    }
});
