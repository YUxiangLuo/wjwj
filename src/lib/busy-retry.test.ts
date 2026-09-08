import { afterEach, expect, mock, test } from "bun:test";
import { fetchWithBusyRetry } from "./busy-retry";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const busy = (code = "AUTH_BUSY", seconds = "1") => Response.json({ success: false, error: { code } }, { status: 429, headers: { "Retry-After": seconds } });

test("explicit busy login retries the same request and then returns success", async () => {
    const calls = mock(async () => calls.mock.calls.length === 1 ? busy() : Response.json({ success: true }));
    globalThis.fetch = calls as unknown as typeof fetch;
    const onRetry = mock(() => undefined);
    const init = { method: "POST", body: JSON.stringify({ studentId: "S001", password: "test" }) };
    expect((await fetchWithBusyRetry("/login", init, { codes: ["AUTH_BUSY"], onRetry })).status).toBe(200);
    expect(calls).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenLastCalledWith("/login", init);
});

test("persistent overload stops after three retries", async () => {
    const calls = mock(async () => busy("ANALYSIS_BUSY"));
    globalThis.fetch = calls as unknown as typeof fetch;
    const response = await fetchWithBusyRetry("/analysis", {}, { codes: ["ANALYSIS_BUSY"] });
    expect(response.status).toBe(429);
    expect(calls).toHaveBeenCalledTimes(4);
}, 12_000);

test("cancelling backoff stops further requests", async () => {
    const calls = mock(async () => busy());
    globalThis.fetch = calls as unknown as typeof fetch;
    const controller = new AbortController();
    const result = fetchWithBusyRetry("/login", { signal: controller.signal }, { codes: ["AUTH_BUSY"] });
    setTimeout(() => controller.abort(), 10);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveBeenCalledTimes(1);
});

test("wrong credentials, unrelated errors, long delays and ambiguous network failures are not replayed", async () => {
    for (const response of [Response.json({}, { status: 401 }), busy("OTHER"), busy("AUTH_BUSY", "60")]) {
        const calls = mock(async () => response);
        globalThis.fetch = calls as unknown as typeof fetch;
        expect(await fetchWithBusyRetry("/login", { method: "POST" }, { codes: ["AUTH_BUSY"] })).toBe(response);
        expect(calls).toHaveBeenCalledTimes(1);
    }
    const calls = mock(async () => { throw new Error("connection lost after send"); });
    globalThis.fetch = calls as unknown as typeof fetch;
    await expect(fetchWithBusyRetry("/login", { method: "POST" }, { codes: ["AUTH_BUSY"] })).rejects.toThrow("connection lost");
    expect(calls).toHaveBeenCalledTimes(1);
});
