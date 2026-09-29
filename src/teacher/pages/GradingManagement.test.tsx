import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router-dom");
const { GradingManagement } = await import("./GradingManagement");
bootstrap.restore();
const originalFetch = globalThis.fetch;
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); globalThis.fetch = originalFetch; restore(); });
function Location() { const location = useLocation(); return <p data-testid="location">{location.pathname + location.search}</p>; }

test("task scope survives page correction, search, pagination and detail navigation", async () => {
    const queries: URLSearchParams[] = [];
    globalThis.fetch = (async (input) => {
        queries.push(new URL(String(input), "http://localhost").searchParams);
        return Response.json({ success: true, data: { total: 21, items: [{ id: 8, studentName: "学生甲", studentId: "S8", className: "一班", topic: "同名模板", status: "submitted", submittedAt: null }] } });
    }) as typeof fetch;
    const view = render(<MemoryRouter initialEntries={["/grading?taskId=42&page=9"]}><Location /><Routes><Route path="/grading" element={<GradingManagement />} /><Route path="/grading/:id" element={<p>详情</p>} /></Routes></MemoryRouter>);
    await waitFor(() => expect(view.getByTestId("location").textContent).toBe("/grading?taskId=42&page=2"));
    await waitFor(() => expect(view.getByRole("button", { name: "上一页" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(view.getByRole("button", { name: "上一页" }));
    await waitFor(() => expect(view.getByTestId("location").textContent).toBe("/grading?taskId=42"));
    fireEvent.change(view.getByLabelText("搜索学生或实验模板"), { target: { value: "S8" } });
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(queries.at(-1)?.get("keyword")).toBe("S8"));
    expect(queries.every(query => query.get("taskId") === "42")).toBe(true);
    fireEvent.click(view.getByRole("button", { name: /学生甲/ }));
    expect(view.getByTestId("location").textContent).toBe("/grading/8?taskId=42&keyword=S8");
});

test("only explicit scope clearing removes taskId, including an invalid empty taskId", async () => {
    const queries: URLSearchParams[] = [];
    globalThis.fetch = (async input => {
        const query = new URL(String(input), "http://localhost").searchParams;
        queries.push(query);
        return Response.json(query.has("taskId") ? { success: false, error: { message: "任务 ID 无效" } } : { success: true, data: { total: 0, items: [] } });
    }) as typeof fetch;
    const view = render(<MemoryRouter initialEntries={["/grading?taskId=&keyword=S8"]}><GradingManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("任务 ID 无效"));
    expect(queries[0]?.has("taskId")).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "查看全部任务" }));
    await waitFor(() => expect(queries.at(-1)?.has("taskId")).toBe(false));
    expect(queries.at(-1)?.get("keyword")).toBe("S8");
});
