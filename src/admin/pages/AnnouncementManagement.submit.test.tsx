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
