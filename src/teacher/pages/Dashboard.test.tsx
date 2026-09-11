import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { Dashboard } from "./Dashboard";

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

test("dashboard reports loading failures instead of claiming there are no active tasks", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/dashboard")) {
            return Response.json({ success: false, error: { code: "FAILED", message: "概览暂时不可用" } }, { status: 500 });
        }
        if (url.endsWith("/api/teacher/announcements")) return Response.json({ success: true, data: [] });
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("概览暂时不可用"));
    expect(view.queryByText("当前没有已开放且未截止的实验任务")).toBeNull();
    expect(view.getByText("活动任务加载失败，请重试")).toBeTruthy();
});
