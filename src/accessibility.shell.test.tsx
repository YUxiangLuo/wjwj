import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
    getAdminDocumentTitle,
    getStudentDocumentTitle,
    getTeacherDocumentTitle,
} from "@/lib/document-title";
import { installDomGlobals } from "@/test-utils/dom";

// Covers the pure title mapping, the title hook, and the two shared shell
// controls. These are deterministic and cheap, so they stay in the blocking
// suite even though the heavier per-page axe scans were trimmed.

let restoreDom: (() => void) | null = null;
let LoadingStatus: ComponentType<{ label?: string }>;
let SkipLink: ComponentType;
let useDocumentTitle: (title: string) => void;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    [LoadingStatus, SkipLink, useDocumentTitle] = await Promise.all([
        import("@/components/LoadingStatus").then((module) => module.LoadingStatus),
        import("@/components/SkipLink").then((module) => module.SkipLink),
        import("@/hooks/useDocumentTitle").then((module) => module.useDocumentTitle),
    ]);
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("route title mappings identify nested student, teacher, and admin pages", () => {
    expect(getStudentDocumentTitle("/task/3/experiment")).toBe("实验过程 - 商务统计虚拟仿真系统 - 学生端");
    expect(getStudentDocumentTitle("/task/3")).toBe("课题详情 - 商务统计虚拟仿真系统 - 学生端");
    expect(getTeacherDocumentTitle("/task/7/progress")).toBe("任务进度 - 商务统计虚拟仿真系统 - 教师端");
    expect(getTeacherDocumentTitle("/grading/5")).toBe("批改详情 - 商务统计虚拟仿真系统 - 教师端");
    expect(getAdminDocumentTitle("/announcement")).toBe("公告管理 - 商务统计虚拟仿真系统 - 管理后台");
});

test("document title hook updates the current browser tab", async () => {
    function Harness({ title }: { title: string }) {
        useDocumentTitle(title);
        return null;
    }

    const view = render(<Harness title="任务大厅 - 学生端" />);
    await waitFor(() => expect(document.title).toBe("任务大厅 - 学生端"));
    view.rerender(<Harness title="实验过程 - 学生端" />);
    await waitFor(() => expect(document.title).toBe("实验过程 - 学生端"));
});

test("shared loading and skip controls expose their purpose", () => {
    const view = render(<><LoadingStatus label="正在加载任务" /><SkipLink /></>);
    expect(view.getByRole("status").textContent).toContain("正在加载任务");
    expect(view.getByRole("link", { name: "跳到主要内容" }).getAttribute("href")).toBe("#main-content");
});

test("styles/theme.css defines semantic scroll-padding offsets so sticky headers and stage action bars never obscure focused controls", async () => {
    const themeCss = await Bun.file("styles/theme.css").text();
    expect(themeCss).toContain("--scroll-offset-top:");
    expect(themeCss).toContain("--scroll-offset-bottom:");
    expect(themeCss).toContain("scroll-padding-top: var(--scroll-offset-top);");
    expect(themeCss).toContain("scroll-padding-bottom: var(--scroll-offset-bottom);");
    // Must stay outside @layer base so unlayered :root { --scroll-offset-top: 5rem } cannot shadow it.
    const layerBaseStart = themeCss.indexOf("@layer base");
    const experimentNavOverride = themeCss.indexOf('html:has([data-testid="student-experiment-navigation"])');
    expect(layerBaseStart).toBeGreaterThan(-1);
    expect(experimentNavOverride).toBeGreaterThan(-1);
    expect(experimentNavOverride).toBeLessThan(layerBaseStart);
});
