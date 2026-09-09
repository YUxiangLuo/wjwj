import { afterEach, expect, test } from "bun:test";
import { installDomGlobals } from "../test-utils/dom";
import { authenticatedFetch, subscribeAuthExpired } from "./authenticated-fetch";

let dom: ReturnType<typeof installDomGlobals>;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; dom?.restore(); });
const success = (data: unknown) => Response.json({ success: true, data });
const failure = (status: number, code: string) => Response.json({ success: false, error: { code } }, { status });
function setup() { dom = installDomGlobals(); }

for (const role of ["student", "teacher", "admin"] as const) {
    test(`${role}: loaded identity is attached to writes and binary reads`, async () => {
        setup();
        globalThis.fetch = (async () => success({ id: 12 })) as unknown as typeof fetch;
        await authenticatedFetch(`/api/${role}/me`);
        const requests: RequestInit[] = [];
        globalThis.fetch = (async (_url, init) => { requests.push(init!); return success({}); }) as typeof fetch;
        await authenticatedFetch(`/api/${role}/password`, { method: "PUT" });
        await authenticatedFetch(`/api/${role}/export`);
        for (const init of requests) expect(new Headers(init.headers).get("X-Expected-User-Id")).toBe("12");
    });
    test(`${role}: failed logout neither broadcasts nor invalidates identity`, async () => {
        setup();
        globalThis.fetch = (async () => success({ id: 12 })) as unknown as typeof fetch;
        await authenticatedFetch(`/api/${role}/me`);
        globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
        await expect(authenticatedFetch(`/api/${role}/logout`, { method: "POST" })).rejects.toThrow("offline");
        expect(localStorage.getItem(`wj:auth-change:${role}`)).toBeNull();
        globalThis.fetch = (async (_url, init) => {
            expect(new Headers(init?.headers).get("X-Expected-User-Id")).toBe("12");
            return success({});
        }) as typeof fetch;
        expect((await authenticatedFetch(`/api/${role}/tasks`)).status).toBe(200);
    });
}

test("late old me 401 cannot invalidate a newer successful lookup", async () => {
    setup();
    let events = 0;
    subscribeAuthExpired("student", () => events++);
    let release!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = (() => ++calls === 1 ? new Promise<Response>(resolve => { release = resolve; }) : Promise.resolve(success({ id: 2 }))) as unknown as typeof fetch;
    const old = authenticatedFetch("/api/student/me");
    expect((await authenticatedFetch("/api/student/me")).status).toBe(200);
    release(failure(401, "UNAUTHORIZED"));
    expect((await (await old).json()).error.code).toBe("STALE_AUTH_RESPONSE");
    expect(events).toBe(0);
});

test("reconfirming the same account supersedes an older business 401", async () => {
    setup();
    globalThis.fetch = (async () => success({ id: 1 })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    let release!: (response: Response) => void;
    let events = 0;
    subscribeAuthExpired("student", () => events++);
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as unknown as typeof fetch;
    const old = authenticatedFetch("/api/student/tasks");
    globalThis.fetch = (async () => success({ id: 1 })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    release(failure(401, "UNAUTHORIZED"));
    expect((await (await old).json()).error.code).toBe("STALE_AUTH_RESPONSE");
    expect(events).toBe(0);
});

test("a retry queued before an account change cannot send another request", async () => {
    setup();
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return success({ id: 1 }); }) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    const response = await authenticatedFetch("/api/student/tasks/1/stats", {}, async (url, init, send) => {
        localStorage.setItem("wj:auth-change:student", "changed-during-backoff");
        return send(url, init);
    });
    expect(response.status).toBe(409);
    expect(calls).toBe(1);
});

test("cross-tab storage change invalidates only that role and blocks old writes before events are delivered", async () => {
    setup();
    let studentEvents = 0, teacherEvents = 0, calls = 0;
    subscribeAuthExpired("student", () => studentEvents++);
    subscribeAuthExpired("teacher", () => teacherEvents++);
    globalThis.fetch = (async () => { calls++; return success({ id: 1 }); }) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    localStorage.setItem("wj:auth-change:student", "other-tab-login");
    const response = await authenticatedFetch("/api/student/tasks/1/submit", { method: "POST" });
    expect(response.status).toBe(409);
    expect(calls).toBe(1);
    expect(studentEvents).toBe(1);
    expect(teacherEvents).toBe(0);
});

test("storage event immediately expires old UI and late successful business responses are discarded", async () => {
    setup();
    globalThis.fetch = (async () => success({ id: 1 })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    let events = 0;
    subscribeAuthExpired("student", () => events++);
    let release!: (response: Response) => void;
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as unknown as typeof fetch;
    const old = authenticatedFetch("/api/student/tasks");
    localStorage.setItem("wj:auth-change:student", "changed");
    window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:student", newValue: "changed" }));
    expect(events).toBe(1);
    release(success([{ privateData: "old account" }]));
    expect((await (await old).json()).error.code).toBe("STALE_AUTH_RESPONSE");
});

for (const [status, code] of [[401, "ACCOUNT_NOT_FOUND"], [403, "ACCOUNT_DISABLED"], [409, "SESSION_CHANGED"]] as const) {
    test(`${code} expires only its role`, async () => {
        setup();
        let studentEvents = 0, adminEvents = 0;
        subscribeAuthExpired("student", () => studentEvents++);
        subscribeAuthExpired("admin", () => adminEvents++);
        globalThis.fetch = (async () => failure(status, code)) as unknown as typeof fetch;
        await authenticatedFetch("/api/student/me");
        expect(studentEvents).toBe(1);
        expect(adminEvents).toBe(0);
    });
}

test("channel notifications ignore superseded signals and work without localStorage", async () => {
    setup();
    let channel!: { onmessage?: (event: { data: { role: string; signal: string } }) => void };
    Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: class {
        onmessage?: (event: { data: { role: string; signal: string } }) => void;
        constructor() { channel = this; }
        postMessage() {}
    } });
    let events = 0;
    subscribeAuthExpired("student", () => events++);
    globalThis.fetch = (async () => success({ user: { id: 1 } })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/login", { method: "POST" });
    channel.onmessage!({ data: { role: "student", signal: "older-login" } });
    expect(events).toBe(0);
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("storage unavailable"); } });
    channel.onmessage!({ data: { role: "student", signal: "new-login-without-storage" } });
    expect(events).toBe(1);
    expect((await authenticatedFetch("/api/student/tasks/1/submit", { method: "POST" })).status).toBe(409);
});

test("successful logout publishes a role-scoped change; generic errors do not expire auth", async () => {
    setup();
    let events = 0;
    subscribeAuthExpired("student", () => events++);
    globalThis.fetch = (async () => success({ id: 1 })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/me");
    for (const [status, code] of [[401, "INVALID_CREDENTIALS"], [403, "FORBIDDEN"], [500, "INTERNAL_ERROR"]] as const) {
        globalThis.fetch = (async () => failure(status, code)) as unknown as typeof fetch;
        await authenticatedFetch("/api/student/password", { method: "PUT" });
    }
    expect(events).toBe(0);
    globalThis.fetch = (async () => success({ ok: true })) as unknown as typeof fetch;
    await authenticatedFetch("/api/student/logout", { method: "POST" });
    expect(localStorage.getItem("wj:auth-change:student")).toBeTruthy();
    expect(localStorage.getItem("wj:auth-change:admin")).toBeNull();
    expect((await authenticatedFetch("/api/student/tasks/1/submit", { method: "POST" })).status).toBe(409);
});
