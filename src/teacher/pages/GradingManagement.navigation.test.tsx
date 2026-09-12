import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrapDom = installDomGlobals();
const { fireEvent, render, cleanup, waitFor } = await import("@testing-library/react");
const { MemoryRouter, Routes, Route, useLocation, useNavigate } = await import("react-router-dom");
const { GradingManagement } = await import("./GradingManagement");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let restore: () => void;
let requests: URL[];
beforeEach(() => {
    restore = installDomGlobals().restore;
    requests = [];
    globalThis.fetch = (async (input) => {
        const url = new URL(String(input), "http://localhost"); requests.push(url);
        return Response.json({ success: true, data: { items: [{ id: 7, studentId: "S1", studentName: "学生", topic: "模板", className: "班级", status: "graded", submittedAt: null }], total: 41, page: Number(url.searchParams.get("page")), pageSize: 20 } });
    }) as typeof fetch;
});
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); globalThis.fetch = originalFetch; restore(); });
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><p data-testid="url">{location.pathname + location.search}</p><button onClick={() => navigate(-1)}>浏览器返回</button></>; }
function page(entry: string) { return render(<MemoryRouter initialEntries={[entry]}><Probe /><Routes><Route path="/grading" element={<GradingManagement />} /><Route path="/grading/:id" element={<p>详情</p>} /></Routes></MemoryRouter>); }

test("opening a result and returning restores applied status, keyword and page", async () => {
    const view = page("/grading?status=graded&keyword=学生&page=2");
    await waitFor(() => expect(view.getByText("学生")).toBeTruthy());
    expect(requests[0]!.searchParams.get("status")).toBe("graded");
    expect(requests[0]!.searchParams.get("keyword")).toBe("学生");
    expect(requests[0]!.searchParams.get("page")).toBe("2");
    fireEvent.click(view.getByRole("button", { name: /S1/ }));
    expect(view.getByTestId("url").textContent).toContain("/grading/7?status=graded");
    fireEvent.click(view.getByText("浏览器返回"));
    await waitFor(() => expect(view.getByLabelText("搜索学生或实验模板")).toBeTruthy());
    expect((view.getByLabelText("搜索学生或实验模板") as HTMLInputElement).value).toBe("学生");
    expect(view.getByText("2 / 3")).toBeTruthy();
});

test("pagination does not silently apply text that has not been searched", async () => {
    const view = page("/grading?keyword=已应用");
    await waitFor(() => expect(view.getByText("学生")).toBeTruthy());
    fireEvent.change(view.getByLabelText("搜索学生或实验模板"), { target: { value: "尚未搜索" } });
    fireEvent.click(view.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(requests.at(-1)!.searchParams.get("page")).toBe("2"));
    expect(requests.at(-1)!.searchParams.get("keyword")).toBe("已应用");
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(requests.at(-1)!.searchParams.get("keyword")).toBe("尚未搜索"));
    expect(requests.at(-1)!.searchParams.get("page")).toBe("1");
});

test("a now-empty last page is replaced with the last available page", async () => {
    globalThis.fetch = (async (input) => { const url = new URL(String(input), "http://localhost"); requests.push(url); return Response.json({ success: true, data: { items: [], total: 20, page: Number(url.searchParams.get("page")), pageSize: 20 } }); }) as typeof fetch;
    const view = page("/grading?status=graded&page=2");
    await waitFor(() => expect(requests.length).toBe(2));
    expect(requests[1]!.searchParams.get("page")).toBe("1");
    expect(view.getByTestId("url").textContent).toBe("/grading?status=graded");
});

for (const pageValue of ["-2", "NaN", "1.5", "9007199254740992"]) {
    test(`invalid URL filters use safe defaults (${pageValue})`, async () => {
        page(`/grading?status=unknown&page=${pageValue}`);
        await waitFor(() => expect(requests.length).toBe(1));
        expect(requests[0]!.searchParams.get("page")).toBe("1");
        expect(requests[0]!.searchParams.get("status")).toBe("pending");
    });
}
