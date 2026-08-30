import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import {
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

test("successful completion remains cleared after the editor unmounts", () => {
    const identity = { experimentId: 22, experimentVersion: 4, stage: 4 };
    const hook = renderHook(() => useExperimentDraft({
        ...identity,
        data: { reportContent: "已提交内容" },
        saveDelayMs: 60_000,
    }));

    act(() => hook.result.current());
    hook.unmount();

    expect(readExperimentDraft(identity)).toBeNull();
});
