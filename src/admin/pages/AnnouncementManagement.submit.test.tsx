import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrapDom.restore();

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
        <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;

afterEach(async () => {
    await act(async () => cleanup());
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
});

test("announcement publishing starts once and keeps the editor locked until completion", async () => {
    dom = installDomGlobals();
    let writes = 0;
    let resolveWrite!: (response: Response) => void;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
            writes += 1;
            return await new Promise<Response>(resolve => { resolveWrite = resolve; });
        }
        return Response.json({ success: true, data: [] });
    }) as unknown as typeof fetch;

    const { AnnouncementManagement } = await import("./AnnouncementManagement");
    const view = render(<AnnouncementManagement />);
    await waitFor(() => expect(view.getByRole("button", { name: "新建公告" })).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "新建公告" }));
    await act(async () => {
        fireEvent.change(view.getByLabelText("标题"), { target: { value: "测试公告" } });
        fireEvent.change(view.getByLabelText("内容"), { target: { value: "公告正文" } });
    });

    const publish = view.getByRole("button", { name: "发布" }) as HTMLButtonElement;
    await waitFor(() => expect(publish.disabled).toBe(false));
    fireEvent.click(publish);
    await waitFor(() => expect(publish.disabled).toBe(true));
    fireEvent.click(publish);
    expect(writes).toBe(1);
    expect((view.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByRole("dialog")).toBeTruthy();

    await act(async () => resolveWrite(Response.json({ success: true, data: { id: 12 } })));
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
});

test("announcement deletion identifies the exact object before the destructive request", async () => {
    dom = installDomGlobals();
    let deletes = 0;
    const announcement = {
        id: 7,
        title: "课堂安排变更",
        content: "正文",
        targetScope: "teacher",
        status: 1,
        createdAt: "2026-09-22T00:00:00.000Z",
        updatedAt: "2026-09-22T00:00:00.000Z",
    };
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
            deletes += 1;
            return Response.json({ success: true, data: { success: true } });
        }
        return Response.json({ success: true, data: [announcement] });
    }) as unknown as typeof fetch;

    const { AnnouncementManagement } = await import("./AnnouncementManagement");
    const view = render(<AnnouncementManagement />);
    const deleteButton = await view.findByRole("button", { name: "删除公告：课堂安排变更" });
    fireEvent.click(deleteButton);

    expect(view.getByRole("alertdialog").textContent).toContain("课堂安排变更");
    expect(view.getByRole("alertdialog").textContent).toContain("已发布");
    expect(view.getByRole("alertdialog").textContent).toContain("不可恢复");
    expect(deletes).toBe(0);

    fireEvent.click(view.getByRole("button", { name: "永久删除" }));
    await waitFor(() => expect(deletes).toBe(1));
    await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
});

test.each(["取消", "关闭", "Escape"])("announcement %s protects unsaved fields until discard is confirmed", async (action) => {
    dom = installDomGlobals();
    globalThis.fetch = (async () => Response.json({ success: true, data: [] })) as unknown as typeof fetch;
    const { AnnouncementManagement } = await import("./AnnouncementManagement");
    const view = render(<AnnouncementManagement />);
    fireEvent.click(view.getByRole("button", { name: "新建公告" }));
    fireEvent.change(view.getByLabelText("标题"), { target: { value: "未保存标题" } });
    fireEvent.change(view.getByLabelText("内容"), { target: { value: "未保存正文" } });
    const confirm = mock(() => false);
    window.confirm = confirm;
    const dismiss = () => action === "Escape"
        ? fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape", code: "Escape" })
        : fireEvent.click(view.getByRole("button", { name: action }));
    dismiss();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((view.getByLabelText("标题") as HTMLInputElement).value).toBe("未保存标题");
    expect((view.getByLabelText("内容") as HTMLTextAreaElement).value).toBe("未保存正文");
    confirm.mockImplementation(() => true);
    dismiss();
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    fireEvent.click(view.getByRole("button", { name: "新建公告" }));
    expect((view.getByLabelText("标题") as HTMLInputElement).value).toBe("");
});

test("unchanged announcement closes silently, but editing an existing body requires confirmation", async () => {
    dom = installDomGlobals();
    globalThis.fetch = (async () => Response.json({ success: true, data: [{ id: 7, title: "原公告", content: "原正文", targetScope: "all", status: 0 }] })) as unknown as typeof fetch;
    const { AnnouncementManagement } = await import("./AnnouncementManagement");
    const view = render(<AnnouncementManagement />);
    fireEvent.click(await view.findByRole("button", { name: "编辑" }));
    const confirm = mock(() => false);
    window.confirm = confirm;
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "编辑" }));
    fireEvent.change(view.getByLabelText("内容"), { target: { value: "改后的正文" } });
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((view.getByLabelText("内容") as HTMLTextAreaElement).value).toBe("改后的正文");
});
