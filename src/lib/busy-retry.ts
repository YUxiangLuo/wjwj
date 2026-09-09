export interface BusyRetryOptions {
    codes: readonly string[];
    onRetry?: () => void;
}

function pause(ms: number, signal?: AbortSignal | null) {
    signal?.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException("请求已取消", "AbortError")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
        signal?.addEventListener("abort", abort, { once: true });
    });
}

/** Retry explicit admission failures only. Never replay an ambiguous failed POST.
 * Three retries, exponential backoff, jitter and AbortSignal bound the work.
 */
export async function fetchWithBusyRetry(
    url: string, init: RequestInit, retry: BusyRetryOptions,
    send: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
        init.signal?.throwIfAborted();
        const response = await send(url, init);
        if (attempt >= 3 || (response.status !== 429 && response.status !== 503)) return response;
        const payload = await response.clone().json().catch(() => null) as { error?: { code?: string } } | null;
        if (!retry.codes.includes(payload?.error?.code ?? "")) return response;
        const header = response.headers.get("Retry-After");
        const seconds = header === null ? NaN : Number(header);
        const retryAfterMs = header === null ? 0 : Number.isFinite(seconds)
            ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(header) - Date.now());
        // Longer server delays require an explicit user retry, not early polling.
        if (retryAfterMs > 10_000) return response;
        const delay = Math.max(1000 * 2 ** attempt, retryAfterMs || 0) + Math.floor(Math.random() * 250);
        retry.onRetry?.();
        await response.body?.cancel();
        await pause(delay, init.signal);
    }
}
