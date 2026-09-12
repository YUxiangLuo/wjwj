import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { installDomGlobals } from "@/test-utils/dom";

// 整页状态（加载失败 / 记录不存在）会替换整个正文，因此必须自带一级标题与出口：
// axe 的 page-has-heading-one 就是这条契约的自动检查。

let restoreDom: (() => void) | null = null;
let StudentStatusPage: typeof import("./StudentStatusPage").StudentStatusPage;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    ({ StudentStatusPage } = await import("./StudentStatusPage"));
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function renderStatus(node: React.ReactNode) {
    return render(<MemoryRouter>{node}</MemoryRouter>);
}

test("an error status keeps a level-one heading, a retry action and a way back", async () => {
    const view = renderStatus(<StudentStatusPage title="实验结果" error={{ message: "提交记录不存在", onRetry: () => {} }} />);

    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("实验结果");
    expect(view.getByRole("button", { name: /重试/ })).toBeTruthy();
    expect(view.getByRole("link", { name: /返回/ }).getAttribute("href")).toBeTruthy();
    await waitFor(() => expect(getAccessibilityViolations(view.container)).resolves.toEqual([]));
});

test("a missing-record status is announced with a heading and an exit", async () => {
    const view = renderStatus(<StudentStatusPage title="提交预览" message="未找到实验数据，请先完成实验各阶段。" />);

    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("提交预览");
    expect(view.getByRole("link", { name: /返回/ })).toBeTruthy();
    await waitFor(() => expect(getAccessibilityViolations(view.container)).resolves.toEqual([]));
});
