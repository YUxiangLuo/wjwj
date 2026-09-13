import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrap = installDomGlobals();
const { cleanup, render, fireEvent } = await import("@testing-library/react");
const completeStage = mock(() => {});
const experiment = { id: 77, version: 9, taskId: 12, questionnaire: { title: "服务端", questions: [] } };
mock.module("../ExperimentLayout", () => ({ useExperiment: () => ({ experiment, completeStage }) }));
const { QuestionnaireDesign } = await import("./QuestionnaireDesign");
bootstrap.restore();
let restore: () => void;
const key = "wj:experiment-draft:77:stage:1:version:9";
const data = { questionnaire: { title: "未保存的旧草稿", questions: [{ id: "q", type: "single", content: "原题", options: ["10²", "102"], optionIds: ["a", "b"] }] }, step: 2, previewCompleted: true, previewContentHash: "kept" };
function stored() { return JSON.stringify({ experimentVersion: 9, updatedAt: new Date().toISOString(), data }); }
beforeEach(() => { restore = installDomGlobals().restore; completeStage.mockClear(); });
// AlertDialog focus restoration must run before the test's DOM realm is replaced.
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

test("invalid browser option format never mounts autosave, trial or editor, and requires explicit discard", async () => {
    const raw = stored(); localStorage.setItem(key, raw);
    const reload = spyOn(window.location, "reload").mockImplementation(() => {});
    try {
        const view = render(<QuestionnaireDesign />);
        expect(view.getByTestId("invalid-questionnaire-draft")).toBeTruthy();
        expect(view.queryByTestId("student-question-editor")).toBeNull();
        await Bun.sleep(700);
        expect(localStorage.getItem(key)).toBe(raw); expect(completeStage).not.toHaveBeenCalled();
        fireEvent.click(view.getByRole("button", { name: "丢弃本地草稿并重新加载" }));
        fireEvent.click(view.getByRole("button", { name: "保留草稿" }));
        expect(localStorage.getItem(key)).toBe(raw); expect(reload).not.toHaveBeenCalled();
        fireEvent.click(view.getByRole("button", { name: "丢弃本地草稿并重新加载" }));
        fireEvent.click(view.getByRole("button", { name: "确认丢弃并重新加载" }));
        expect(localStorage.getItem(key)).toBeNull(); expect(reload).toHaveBeenCalledTimes(1);
        expect(experiment.questionnaire).toEqual({ title: "服务端", questions: [] });
    } finally { reload.mockRestore(); }
});
test("backup retains the original invalid draft without converting its labels or identifiers", async () => {
    const raw = stored(); localStorage.setItem(key, raw);
    let blob: Blob | undefined;
    const url = spyOn(URL, "createObjectURL").mockImplementation(value => { blob = value as Blob; return "blob:backup"; });
    const revoke = spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = spyOn(window.HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
        const view = render(<QuestionnaireDesign />);
        fireEvent.click(view.getByRole("button", { name: "下载本地草稿备份" }));
        expect(JSON.parse(await blob!.text())).toEqual({ experimentId: 77, experimentVersion: 9, stage: 1, data });
        expect(click).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith("blob:backup"); expect(localStorage.getItem(key)).toBe(raw);
    } finally { url.mockRestore(); revoke.mockRestore(); click.mockRestore(); }
});
