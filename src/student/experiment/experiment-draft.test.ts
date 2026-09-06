import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import {
    clearAllExperimentDrafts,
    clearExperimentDraft,
    readExperimentDraft,
    writeExperimentDraft,
    useExperimentDraft,
} from "./experiment-draft";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
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

test("account logout cleanup removes all experiment drafts but preserves unrelated storage", () => {
    writeExperimentDraft({ experimentId: 18, experimentVersion: 7, stage: 1 }, { title: "问卷" });
    writeExperimentDraft({ experimentId: 19, experimentVersion: 2, stage: 4 }, { report: "报告" });
    localStorage.setItem("unrelated", "keep");
    clearAllExperimentDrafts();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("unrelated")).toBe("keep");
});

test("expired drafts are removed instead of being restored", () => {
    const identity = { experimentId: 88, experimentVersion: 1, stage: 4 };
    const key = "wj:experiment-draft:88:stage:4:version:1";
    localStorage.setItem(key, JSON.stringify({
        experimentVersion: 1,
        updatedAt: "2020-01-01T00:00:00.000Z",
        data: { report: "expired" },
    }));
    expect(readExperimentDraft(identity)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
});

test("different experiment versions cannot overwrite each other's stage draft", () => {
    const current = { experimentId: 18, experimentVersion: 8, stage: 2 };
    const stale = { ...current, experimentVersion: 7 };

    writeExperimentDraft(current, { finalSampleSize: 80 });
    writeExperimentDraft(stale, { finalSampleSize: 70 });

    expect(readExperimentDraft<{ finalSampleSize: number }>(stale)).toEqual({ finalSampleSize: 70 });
    expect(readExperimentDraft<{ finalSampleSize: number }>(current)).toEqual({ finalSampleSize: 80 });
    expect(readExperimentDraft(stale)).toBeNull();
});

test("unmount flushes the latest payload inside the debounce window", () => {
    const identity = { experimentId: 21, experimentVersion: 3, stage: 1 };
    const hook = renderHook(
        ({ title }) => useExperimentDraft({
            ...identity,
            data: { title },
            saveDelayMs: 60_000,
        }),
        { initialProps: { title: "初始标题" } },
    );

    act(() => hook.rerender({ title: "离开前最后一次编辑" }));
    hook.unmount();

    expect(readExperimentDraft<{ title: string }>(identity)).toEqual({ title: "离开前最后一次编辑" });
});

test("pagehide flushes edits before the debounce and completion cannot resurrect them", () => {
    const identity = { experimentId: 24, experimentVersion: 1, stage: 4 };
    const hook = renderHook(() => useExperimentDraft({ ...identity, data: { report: "最后编辑" }, saveDelayMs: 60_000 }));
    expect(readExperimentDraft(identity)).toBeNull();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(readExperimentDraft<{ report: string }>(identity)).toEqual({ report: "最后编辑" });
    expect(hook.result.current.status).toBe("saved");
    act(() => hook.result.current.clear());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(readExperimentDraft(identity)).toBeNull();
    hook.unmount();
});

test("storage failure is visible and retry saves the latest payload", async () => {
    const identity = { experimentId: 25, experimentVersion: 1, stage: 4 };
    const storage = localStorage;
    const values = new Map<string, string>();
    let fail = true;
    globalThis.localStorage = {
        get length() { return values.size; },
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { if (fail) throw new Error("quota"); values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        clear: () => values.clear(),
    };
    const hook = renderHook(() => useExperimentDraft({ ...identity, data: { report: "不能丢失" }, saveDelayMs: 0 }));
    try {
        await waitFor(() => expect(hook.result.current.status).toBe("error"));
        expect(readExperimentDraft(identity)).toBeNull();
        fail = false;
        act(() => hook.result.current.retry());
        expect(hook.result.current.status).toBe("saved");
        expect(readExperimentDraft<{ report: string }>(identity)).toEqual({ report: "不能丢失" });
    } finally {
        hook.unmount();
        globalThis.localStorage = storage;
    }
});

test("successful completion remains cleared after the editor unmounts", () => {
    const identity = { experimentId: 22, experimentVersion: 4, stage: 4 };
    const hook = renderHook(() => useExperimentDraft({
        ...identity,
        data: { reportContent: "已提交内容" },
        saveDelayMs: 60_000,
    }));

    act(() => hook.result.current.clear());
    hook.unmount();

    expect(readExperimentDraft(identity)).toBeNull();
});

test("successful completion stays suspended across the server version update", () => {
    const oldIdentity = { experimentId: 23, experimentVersion: 4, stage: 4 };
    const newIdentity = { ...oldIdentity, experimentVersion: 5 };
    const hook = renderHook(
        ({ identity }) => useExperimentDraft({
            ...identity,
            data: { reportContent: "已提交内容" },
            saveDelayMs: 60_000,
        }),
        { initialProps: { identity: oldIdentity } },
    );

    act(() => hook.result.current.clear());
    act(() => hook.rerender({ identity: newIdentity }));
    hook.unmount();

    expect(readExperimentDraft(oldIdentity)).toBeNull();
    expect(readExperimentDraft(newIdentity)).toBeNull();
});
