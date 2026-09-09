import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { installDomGlobals } from "../test-utils/dom";
import { createApiClient } from "./api-client";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(() => { mock.restore(); globalThis.fetch = originalFetch; dom?.restore(); });
const ok = (data: unknown) => Response.json({ success: true, data });
const fail = (status: number, code: string) => Response.json({ success: false, error: { code, message: code } }, { status });
function setup(role = "student") {
    dom = installDomGlobals(`http://localhost/${role}/task/1`);
    return spyOn(window.location, "replace").mockImplementation(() => {});
}

for (const role of ["student", "teacher", "admin"] as const) {
    test(`${role}: binds JSON, multipart and binary requests to the initial account`, async () => {
        setup(role);
        const client = createApiClient(role);
        globalThis.fetch = (async () => ok({ id: 12 })) as unknown as typeof fetch;
        await client.request(`/api/${role}/me`);
        const calls: RequestInit[] = [];
        globalThis.fetch = (async (_url, init) => { calls.push(init!); return ok({}); }) as typeof fetch;
        await client.request(`/api/${role}/save`, { method: "POST", body: "{}" });
        const body = new FormData(); body.append("file", new File(["test"], "test.csv"));
        await client.request(`/api/${role}/upload`, { method: "POST", body });
        await client.fetch(`/api/${role}/download`);
        for (const call of calls) {
            expect(new Headers(call.headers).get("X-Expected-User-Id")).toBe("12");
            expect(call.credentials).toBe("include");
        }
        expect(new Headers(calls[0]!.headers).get("Content-Type")).toBe("application/json");
        expect(new Headers(calls[1]!.headers).has("Content-Type")).toBe(false);
    });
    for (const action of ["login", "logout", "password"] as const) {
        test(`${role} ${action}: successful change broadcasts once and replaces the document`, async () => {
            const navigate = setup(role);
            const client = createApiClient(role);
            globalThis.fetch = (async () => ok({ id: 12 })) as unknown as typeof fetch;
            await client.request(`/api/${role}/me`);
            globalThis.fetch = (async () => ok({ ok: true })) as unknown as typeof fetch;
            expect((await client.request(`/api/${role}/${action}`, { method: "POST" })).success).toBe(true);
            expect(navigate).toHaveBeenCalledWith(action === "logout" ? `/${role}/login` : action === "password" ? window.location.href : `/${role}`);
            expect(localStorage.getItem(`wj:auth-change:${role}`)).toBeTruthy();
            const fetcher = mock(async () => ok({})); globalThis.fetch = fetcher as unknown as typeof fetch;
            expect((await client.request(`/api/${role}/save`, { method: "POST" })).success).toBe(false);
            expect(fetcher).not.toHaveBeenCalled();
        });
    }
    test(`${role}: failed logout never navigates or broadcasts, and retry succeeds`, async () => {
        const navigate = setup(role), client = createApiClient(role);
        globalThis.fetch = (async () => ok({ id: 12 })) as unknown as typeof fetch;
        await client.request(`/api/${role}/me`);
        for (const failure of ["network", "500"]) {
            globalThis.fetch = (async () => { if (failure === "network") throw new TypeError("offline"); return fail(500, "INTERNAL_ERROR"); }) as unknown as typeof fetch;
            expect((await client.request(`/api/${role}/logout`, { method: "POST" })).success).toBe(false);
            expect(navigate).not.toHaveBeenCalled();
            expect(localStorage.getItem(`wj:auth-change:${role}`)).toBeNull();
        }
        globalThis.fetch = (async () => ok({ ok: true })) as unknown as typeof fetch;
        expect((await client.request(`/api/${role}/logout`, { method: "POST" })).success).toBe(true);
        expect(navigate).toHaveBeenCalledWith(`/${role}/login`);
    });
}

test("only same-role storage notifications replace the page; pending results and later requests are blocked", async () => {
    const navigate = setup(), client = createApiClient("student");
    globalThis.fetch = (async () => ok({ id: 1 })) as unknown as typeof fetch;
    await client.request("/api/student/me");
    let release!: (response: Response) => void;
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as unknown as typeof fetch;
    const pending = client.request("/api/student/tasks");
    window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:teacher" }));
    expect(navigate).not.toHaveBeenCalled();
    window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:student" }));
    expect(navigate).toHaveBeenCalledWith("/student");
    release(ok([{ privateData: "old account" }]));
    expect((await pending).success).toBe(false);
    await expect(client.fetch("/api/student/download")).rejects.toThrow("正在重新加载页面");
});

test("old 401 after successful login cannot cause a second navigation", async () => {
    const navigate = setup(), client = createApiClient("student");
    let release!: (response: Response) => void;
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as unknown as typeof fetch;
    const old = client.request("/api/student/me");
    globalThis.fetch = (async () => ok({ user: { id: 1 } })) as unknown as typeof fetch;
    await client.request("/api/student/login", { method: "POST" });
    release(fail(401, "UNAUTHORIZED"));
    expect((await old).success).toBe(false);
    expect(navigate.mock.calls).toEqual([["/student"]]);
});

for (const [status, code] of [[401, "UNAUTHORIZED"], [401, "ACCOUNT_NOT_FOUND"], [403, "ACCOUNT_DISABLED"], [409, "SESSION_CHANGED"]] as const) {
    test(`${code}: bootstrap does not loop; protected API errors replace with login`, async () => {
        const navigate = setup(), client = createApiClient("student");
        globalThis.fetch = (async () => fail(status, code)) as unknown as typeof fetch;
        expect((await client.request("/api/student/me")).error?.code).toBe(code);
        expect(navigate).not.toHaveBeenCalled();
        await client.fetch("/api/student/download");
        expect(navigate).toHaveBeenCalledWith("/student/login");
    });
}

test("business errors and wrong passwords are not logout", async () => {
    const navigate = setup(), client = createApiClient("student");
    for (const [status, code] of [[401, "INVALID_CREDENTIALS"], [403, "FORBIDDEN"], [500, "INTERNAL_ERROR"]] as const) {
        globalThis.fetch = (async () => fail(status, code)) as unknown as typeof fetch;
        expect((await client.request("/api/student/password", { method: "PUT" })).error?.code).toBe(code);
    }
    expect(navigate).not.toHaveBeenCalled();
});

test("without localStorage, account binding and full navigation still work", async () => {
    const navigate = setup(), client = createApiClient("student");
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("unavailable"); } });
    globalThis.fetch = (async () => ok({ id: 1 })) as unknown as typeof fetch;
    await client.request("/api/student/me");
    globalThis.fetch = (async (_url, init) => {
        expect(new Headers(init?.headers).get("X-Expected-User-Id")).toBe("1");
        return fail(409, "SESSION_CHANGED");
    }) as typeof fetch;
    await client.request("/api/student/save", { method: "POST" });
    expect(navigate).toHaveBeenCalledWith("/student/login");
});

test("back/forward cache restoration reloads identity even after a prior navigation", async () => {
    setup();
    const reload = spyOn(window.location, "reload").mockImplementation(() => {});
    const client = createApiClient("student");
    globalThis.fetch = (async () => ok({ id: 1 })) as unknown as typeof fetch;
    await client.request("/api/student/me");
    await client.request("/api/student/logout", { method: "POST" });
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(client.fetch("/api/student/tasks")).rejects.toThrow("正在重新加载页面");
});

test("queued busy retries cannot send after a same-role auth notification", async () => {
    const navigate = setup(), client = createApiClient("student");
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return fail(503, "STATS_BUSY"); }) as unknown as typeof fetch;
    await client.request("/api/student/stats", {}, {
        codes: ["STATS_BUSY"], onRetry: () => window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:student" })),
    });
    expect(calls).toBe(1);
    expect(navigate).toHaveBeenCalledWith("/student");
});
