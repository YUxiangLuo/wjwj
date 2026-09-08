import { afterEach, expect, mock, test } from "bun:test";
import { experimentApi } from "./api-client";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("getStats forwards cancellation through busy backoff without another request", async () => {
    const calls = mock(async (_url: string, _init: RequestInit) => calls.mock.calls.length === 1
        ? Response.json({ success: false, error: { code: "STATS_BUSY", message: "busy" } }, { status: 503 })
        : Response.json({ success: true, data: { stats: {} } }));
    globalThis.fetch = calls as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = experimentApi.getStats(3, controller.signal);
    const timer = setTimeout(() => controller.abort(), 10);
    try {
        const response = await pending;
        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("NETWORK_ERROR");
        expect(controller.signal.aborted).toBe(true);
        expect(calls).toHaveBeenCalledTimes(1);
        expect(calls.mock.calls[0]).toEqual([
            "/api/student/tasks/3/stats", expect.objectContaining({ signal: controller.signal }),
        ]);
    } finally { clearTimeout(timer); controller.abort(); }
});

test("getStats does not fetch when its caller has already cancelled", async () => {
    const calls = mock(async () => Response.json({ success: true, data: { stats: {} } }));
    globalThis.fetch = calls as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    expect((await experimentApi.getStats(3, controller.signal)).success).toBe(false);
    expect(calls).not.toHaveBeenCalled();
});
