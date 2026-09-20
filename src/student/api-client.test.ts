import { afterEach, expect, mock, test } from "bun:test";
import { experimentApi } from "./api-client";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("getStats returns a busy response without automatic retries", async () => {
    const calls = mock(async () => Response.json({ success: false, error: { code: "STATS_BUSY", message: "busy" } }, { status: 503 }));
    globalThis.fetch = calls as unknown as typeof fetch;
    const response = await experimentApi.getStats(3);
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("STATS_BUSY");
    expect(calls).toHaveBeenCalledTimes(1);
});

test("getStats does not fetch when its caller has already cancelled", async () => {
    const calls = mock(async () => Response.json({ success: true, data: { stats: {} } }));
    globalThis.fetch = calls as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    expect((await experimentApi.getStats(3, controller.signal)).success).toBe(false);
    expect(calls).not.toHaveBeenCalled();
});
