import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { installDomGlobals } from "../test-utils/dom";
import { createApiClient, type AuthRole } from "./api-client";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(() => { mock.restore(); globalThis.fetch = originalFetch; dom?.restore(); });
async function setup(role: AuthRole = "student") {
    dom = installDomGlobals(`http://localhost/${role}/task/1`);
    spyOn(window.location, "replace").mockImplementation(() => {});
    const createUrl = spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
    const revokeUrl = spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = spyOn(window.HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const client = createApiClient(role);
    globalThis.fetch = (async () => Response.json({ success: true, data: { id: 11 } })) as unknown as typeof fetch;
    await client.request(`/api/${role}/me`);
    return { client, createUrl, revokeUrl, click };
}
for (const role of ["student", "teacher", "admin"] as const) {
    test(`${role} native resources bind the document identity without leaking credentials`, async () => {
        const { client } = await setup(role);
        const path = client.resourceUrl(`/api/${role}/files/1?mode=preview&expected_user_id=99#page=2`);
        expect(path).toBe(`/api/${role}/files/1?mode=preview&expected_user_id=11#page=2`);
        expect(() => client.resourceUrl("https://other.example/api/student/file")).toThrow("同源");
        expect(() => client.resourceUrl("/api/other/file")).toThrow("当前角色");
        expect(() => client.resourceUrl(`/api/${role}/../other/file`)).toThrow("当前角色");
        window.dispatchEvent(new window.StorageEvent("storage", { key: `wj:auth-change:${role}` }));
        // Pure URL construction during a final React render must not throw or rebind.
        expect(client.resourceUrl(`/api/${role}/files/1`)).toEndWith("expected_user_id=11");
        expect("fetch" in client).toBe(false);
    });
}
test("native resource URLs require completed identity bootstrap", () => {
    dom = installDomGlobals();
    expect(() => createApiClient("student").resourceUrl("/api/student/file")).toThrow("尚未确认登录身份");
});
test("a completed download publishes once and releases its object URL and link", async () => {
    const { client, createUrl, revokeUrl, click } = await setup();
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("X-Expected-User-Id")).toBe("11");
        return new Response("complete export");
    }) as unknown as typeof fetch;
    await client.download("/api/student/export", "sample.csv");
    expect(await (createUrl.mock.calls[0]![0] as Blob).text()).toBe("complete export");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:fixture");
    expect(document.querySelectorAll("a")).toHaveLength(0);
});
test("an auth change between headers and body completion prevents file publication", async () => {
    const { client, createUrl, click } = await setup();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch;
    const pending = client.download("/api/student/export", "old.csv").then(() => null, cause => cause);
    await Bun.sleep(0);
    window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:student" }));
    controller.enqueue(new TextEncoder().encode("old identity data")); controller.close();
    expect((await pending)?.message).toContain("正在重新加载页面");
    expect(createUrl).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
test("failed response bodies do not publish partial files", async () => {
    const { client, createUrl, click } = await setup();
    globalThis.fetch = (async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("truncated")); } }))) as unknown as typeof fetch;
    await expect(client.download("/api/student/export", "partial.csv")).rejects.toThrow("truncated");
    expect(createUrl).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
test("object URLs are released even when publication throws", async () => {
    const { client, revokeUrl, click } = await setup();
    click.mockImplementation(() => { throw new Error("blocked"); });
    globalThis.fetch = (async () => new Response("data")) as unknown as typeof fetch;
    await expect(client.download("/api/student/export", "sample.csv")).rejects.toThrow("blocked");
    expect(revokeUrl).toHaveBeenCalledWith("blob:fixture");
    expect(document.querySelectorAll("a")).toHaveLength(0);
});
