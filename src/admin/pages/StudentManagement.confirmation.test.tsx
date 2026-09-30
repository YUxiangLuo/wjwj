import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { MemoryRouter } from "react-router-dom";

const bootstrap = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrap.restore();
const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await act(async () => cleanup());
    await Bun.sleep(0);
    globalThis.fetch = originalFetch;
    dom?.restore();
});

test("password reset requires named confirmation, prevents duplicate writes and allows retry", async () => {
    dom = installDomGlobals();
    const writes: string[] = [];
    let response = Promise.withResolvers<Response>();
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { writes.push(url); return response.promise; }
        return Response.json({ success: true, data: url.includes("/classes") ? [] : {
            items: [{ id: 7, studentId: "S0007", name: "学生甲", progress: 0 }], total: 1, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    const reset = await view.findByRole("button", { name: "重置密码" });
    fireEvent.click(reset);
    expect(writes).toHaveLength(0);
    expect(view.getByRole("alertdialog").textContent).toContain("学生甲");
    expect(view.getByRole("alertdialog").textContent).toContain("S0007");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    expect(writes).toHaveLength(0);
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(reset);
    fireEvent.click(view.getByRole("button", { name: "确认重置" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain("/7/reset-password");
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reset);
    expect(writes).toHaveLength(1);
    await act(async () => response.resolve(Response.json({ success: false, error: { message: "请重试" } }, { status: 500 })));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    response = Promise.withResolvers<Response>();
    fireEvent.click(reset);
    fireEvent.click(view.getByRole("button", { name: "确认重置" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    await act(async () => response.resolve(Response.json({ success: true, data: {} })));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
});
