import { expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { GradingManagement } from "./GradingManagement";

function payload(name: string) {
    return { success: true, data: { items: [{ id: 1, studentId: "S1", studentName: name, topic: "模板", className: "班级", status: "submitted", submittedAt: null }], total: 1, page: 1, pageSize: 20 } };
}

test("grading search ignores late responses and exposes failures with retry", async () => {
    const dom = installDomGlobals();
    const originalFetch = globalThis.fetch;
    const pending: Array<(r: Response) => void> = [];
    globalThis.fetch = (() => new Promise<Response>(resolve => pending.push(resolve))) as unknown as typeof fetch;
    try {
        const view = render(<MemoryRouter><GradingManagement /></MemoryRouter>);
        const input = view.getByLabelText("搜索学生或实验模板");
        fireEvent.change(input, { target: { value: "新查询" } });
        fireEvent.click(view.getByRole("button", { name: "搜索" }));
        expect(pending).toHaveLength(2);
        await act(async () => pending[1]!(Response.json(payload("新学生"))));
        await waitFor(() => expect(view.getByText("新学生")).toBeTruthy());
        await act(async () => pending[0]!(Response.json(payload("旧学生"))));
        expect(view.queryByText("旧学生")).toBeNull();
        fireEvent.click(view.getByRole("button", { name: "搜索" }));
        await act(async () => pending[2]!(Response.json({ success: false, error: { code: "FAILED", message: "加载失败请重试" } })));
        expect(view.getByRole("alert").textContent).toContain("加载失败请重试");
        expect(view.queryByText("新学生")).toBeNull();
        expect(view.queryByText("暂无记录")).toBeNull();
        fireEvent.click(view.getByText("重试加载"));
        await act(async () => pending[3]!(Response.json(payload("恢复学生"))));
        await waitFor(() => expect(view.getByText("恢复学生")).toBeTruthy());
        expect(view.queryByRole("alert")).toBeNull();
    } finally {
        cleanup();
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});
