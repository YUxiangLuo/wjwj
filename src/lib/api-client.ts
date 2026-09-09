import { fetchWithBusyRetry, type BusyRetryOptions } from "./busy-retry";

export type AuthRole = "student" | "teacher" | "admin";
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
}
const AUTH_ERRORS = new Set(["UNAUTHORIZED", "SESSION_EXPIRED", "ACCOUNT_NOT_FOUND", "ACCOUNT_DISABLED", "SESSION_CHANGED"]);
export function isAuthError(code?: string) { return AUTH_ERRORS.has(code ?? ""); }
export function reloadPage() { window.location.reload(); }

/** One identity per document. Auth changes replace the document, never repair React state.
 * The server still checks the expected identity if a suspended tab misses the storage event.
 */
export function createApiClient(role: AuthRole) {
    const root = `/${role}`;
    const api = `/api/${role}`;
    const changeKey = `wj:auth-change:${role}`;
    let page: Window | undefined;
    let userId: number | null = null;
    let leaving = false;

    function initialize() {
        if (typeof window === "undefined" || page === window) return;
        page = window;
        userId = null;
        leaving = false;
        const currentPage = page;
        page.addEventListener("storage", event => {
            if (page === currentPage && event.key === changeKey) navigate(root);
        });
        page.addEventListener("pageshow", event => {
            if (page === currentPage && event.persisted) {
                leaving = true;
                currentPage.location.reload(); // Back/forward cache must not resurrect an old identity.
            }
        });
    }
    function navigate(url: string) {
        if (!page || leaving) return;
        leaving = true; // Block old writes/results while full navigation is in progress.
        page.location.replace(url);
    }
    function ensureActive() {
        if (leaving) throw new DOMException("登录状态已变化，正在重新加载页面", "AbortError");
    }
    async function send(url: string, init: RequestInit = {}): Promise<Response> {
        initialize();
        ensureActive();
        const headers = new Headers(init.headers);
        if (userId !== null && url.startsWith(`${api}/`) && url !== `${api}/login`) {
            headers.set("X-Expected-User-Id", String(userId));
        }
        if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        const response = await fetch(url, { credentials: "include", ...init, headers });
        ensureActive();
        if (!response.ok) {
            const body = await response.clone().json().catch(() => null);
            // /me is only the initial bootstrap; a logged-out login page must not reload itself.
            if (url !== `${api}/me` && isAuthError(body?.error?.code)
                && [401, 403, 409].includes(response.status)) navigate(`${root}/login`);
        }
        return response;
    }
    async function request<T>(url: string, init: RequestInit = {}, retry?: BusyRetryOptions): Promise<ApiResponse<T>> {
        try {
            const response = retry ? await fetchWithBusyRetry(url, init, retry, send) : await send(url, init);
            const payload = await response.json() as ApiResponse<T>;
            ensureActive();
            if (response.ok && payload.success) {
                if (url === `${api}/me`) {
                    const id = (payload.data as { id?: number } | undefined)?.id;
                    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error("登录信息无效，请刷新重试");
                    if (userId !== null && userId !== id) { navigate(root); ensureActive(); }
                    userId = id!;
                }
                if ([`${api}/login`, `${api}/logout`, `${api}/password`].includes(url)) {
                    // An event marker, not a credential: works on ordinary intranet HTTP too.
                    try { page?.localStorage.setItem(changeKey, `${Date.now()}:${Math.random()}`); } catch { /* Storage is best-effort. */ }
                    navigate(url === `${api}/logout` ? `${root}/login` : url === `${api}/password` ? page?.location.href ?? root : root);
                }
            }
            return payload;
        } catch (cause) {
            return { success: false, error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" } };
        }
    }
    /** Native links/media keep streaming; the URL binds the same non-secret account ID. */
    function resourceUrl(path: string): string {
        initialize();
        if (!page || userId === null) throw new Error("尚未确认登录身份，不能访问文件");
        const url = new URL(path, page.location.href);
        if (url.origin !== page.location.origin || !url.pathname.startsWith(`${api}/`)) {
            throw new Error("文件地址必须属于当前角色的同源 API");
        }
        url.searchParams.set("expected_user_id", String(userId));
        // Constructing a URL starts no I/O. Keep the bound ID even while navigating away.
        return `${url.pathname}${url.search}${url.hash}`;
    }
    /** Own the whole async read and publish boundary; never expose a raw Response. */
    async function download(path: string, filename: string): Promise<void> {
        const response = await send(path);
        if (!response.ok) throw new Error("下载失败");
        const blob = await response.blob();
        ensureActive();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        try {
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
        } finally {
            link.remove();
            URL.revokeObjectURL(url);
        }
    }
    return { request, resourceUrl, download };
}
