import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { readExperimentDraft, useExperimentDraft } from "@/student/experiment/experiment-draft";
import { PageErrorBoundary } from "./PageErrorBoundary";

let restore: () => void;
let log: ReturnType<typeof spyOn>;
beforeEach(() => { restore = installDomGlobals().restore; log = spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); log.mockRestore(); restore(); });
const identity = { experimentId: 99, experimentVersion: 2, stage: 4 };
function Broken({ crash }: { crash: boolean }) {
    if (crash) throw new Error("test render failure");
    return <span>页面可用</span>;
}
function Editor({ crash }: { crash: boolean }) {
    const [text, setText] = useState(() => readExperimentDraft<{ text: string }>(identity)?.text ?? "初始内容");
    useExperimentDraft({ ...identity, data: { text }, baseline: { text: "初始内容" } });
    return <><p>{text}</p><button onClick={() => setText("尚未完成阶段的报告")}>修改报告</button><Broken crash={crash} /></>;
}
function tree(crash: boolean, path = "/task/1/experiment") {
    return <MemoryRouter><nav>保留导航</nav><PageErrorBoundary resetKey={path}><Editor crash={crash} /></PageErrorBoundary></MemoryRouter>;
}

test("render failures preserve local draft content and retry recovers it", () => {
    const view = render(tree(false));
    fireEvent.click(view.getByText("修改报告"));
    expect(readExperimentDraft<{ text: string }>(identity)).toEqual({ text: "尚未完成阶段的报告" });
    view.rerender(tree(true));
    expect(view.getByTestId("page-error-boundary")).toBeTruthy();
    expect(view.getByText("保留导航")).toBeTruthy();
    expect(readExperimentDraft<{ text: string }>(identity)).toEqual({ text: "尚未完成阶段的报告" });
    view.rerender(tree(false));
    fireEvent.click(view.getByText("重试显示"));
    expect(view.getByText("尚未完成阶段的报告")).toBeTruthy();
    expect(view.queryByTestId("page-error-boundary")).toBeNull();
});

test("navigation clears a failed boundary without remounting healthy editors", () => {
    const view = render(tree(false));
    fireEvent.click(view.getByText("修改报告"));
    view.rerender(tree(false, "/task/1/experiment?tab=report"));
    expect(view.getByText("尚未完成阶段的报告")).toBeTruthy();
    expect(readExperimentDraft<{ text: string }>(identity)).toEqual({ text: "尚未完成阶段的报告" });
    view.rerender(tree(true, "/task/1/experiment?tab=report"));
    view.rerender(tree(false, "/task/2/experiment"));
    expect(view.getByText("页面可用")).toBeTruthy();
});
