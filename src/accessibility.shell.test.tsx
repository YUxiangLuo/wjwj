import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
    getAdminDocumentTitle,
    getStudentDocumentTitle,
    getTeacherDocumentTitle,
} from "@/lib/document-title";
import { installDomGlobals } from "@/test-utils/dom";

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
    expect(getStudentDocumentTitle("/task/3/experiment")).toStartWith("实验过程 -");
    expect(getTeacherDocumentTitle("/task/7/progress")).toStartWith("任务进度 -");
    expect(getTeacherDocumentTitle("/grading/5")).toStartWith("批改详情 -");
    expect(getAdminDocumentTitle("/announcement")).toStartWith("公告管理 -");
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
