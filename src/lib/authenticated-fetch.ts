import { AUTH_EXPIRED_EVENT, notifyAuthExpired } from "./auth-expired";

export type AuthRole = "student" | "teacher" | "admin";
const STORAGE_PREFIX = "wj:auth-change:";
export const EXPECTED_USER_HEADER = "X-Expected-User-Id";

interface AuthState {
    generation: number;
    lookup: number;
    userId: number | null;
    blocked: boolean;
    signal: string | null;
}
interface BrowserAuth {
    states: Map<AuthRole, AuthState>;
    channel?: BroadcastChannel;
}
const browsers = new WeakMap<Window, BrowserAuth>();

function readSignal(role: AuthRole) {
    try { return window.localStorage.getItem(`${STORAGE_PREFIX}${role}`); } catch { return null; }
}
function emitExpired(role: AuthRole) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { role } }));
}
function invalidate(state: AuthState, role: AuthRole) {
    state.generation++;
    state.userId = null;
    state.blocked = true;
    emitExpired(role);
}
function browserAuth(): BrowserAuth | null {
    if (typeof window === "undefined") return null;
    const existing = browsers.get(window);
    if (existing) return existing;
    const browser: BrowserAuth = { states: new Map() };
    browsers.set(window, browser);
    const changed = (role: AuthRole, signal: string | null) => {
        const state = browser.states.get(role);
        if (!state || state.signal === signal) return;
        state.signal = signal;
        invalidate(state, role);
    };
    window.addEventListener("storage", event => {
        for (const role of ["student", "teacher", "admin"] as const) {
            if (event.key === null || event.key === `${STORAGE_PREFIX}${role}`) changed(role, readSignal(role));
        }
    });
    // Storage is the synchronous preflight; the channel also works when storage is unavailable.
    if (typeof window.BroadcastChannel === "function") {
        browser.channel = new window.BroadcastChannel("wj:auth-change");
        browser.channel.onmessage = event => {
            const { role, signal } = event.data ?? {};
            if (["student", "teacher", "admin"].includes(role) && typeof signal === "string") {
                // A queued channel message may predate this tab's own successful login.
                changed(role, readSignal(role) ?? signal);
            }
        };
    }
    return browser;
}
function getState(browser: BrowserAuth, role: AuthRole) {
    let state = browser.states.get(role);
    if (!state) {
        state = { generation: 0, lookup: 0, userId: null, blocked: false, signal: readSignal(role) };
        browser.states.set(role, state);
    }
    return state;
}
function publish(browser: BrowserAuth, state: AuthState, role: AuthRole) {
    const signal = crypto.randomUUID();
    state.signal = signal;
    try { window.localStorage.setItem(`${STORAGE_PREFIX}${role}`, signal); } catch { /* Channel fallback. */ }
    browser.channel?.postMessage({ role, signal });
}
function staleResponse() {
    return Response.json({ success: false, error: { code: "STALE_AUTH_RESPONSE", message: "登录状态已变化，请重新确认身份后重试" } }, { status: 409 });
}

/** The expected identity is a consistency check, never an authorization credential.
 * Keep it fixed across retries; a new cookie must not turn an old editor into another user.
 */
export async function authenticatedFetch(
    url: string,
    init: RequestInit = {},
    transport: (url: string, init: RequestInit, send: (url: string, init: RequestInit) => Promise<Response>) => Promise<Response>
        = (url, init, send) => send(url, init),
): Promise<Response> {
    const match = /^\/api\/(student|teacher|admin)\/([^/?]+)/.exec(url);
    const browser = browserAuth();
    if (!match || !browser) return transport(url, init, (url, init) => fetch(url, init));
    const role = match[1] as AuthRole;
    const endpoint = match[2];
    const state = getState(browser, role);
    const signal = readSignal(role);
    // A suspended tab may send a request before its queued storage event is delivered.
    if (signal !== null && signal !== state.signal) {
        state.signal = signal;
        invalidate(state, role);
    }
    const lookup = endpoint === "me" ? ++state.lookup : state.lookup;
    if (state.blocked && endpoint !== "login" && endpoint !== "me") return staleResponse();
    const generation = state.generation;
    const headers = new Headers(init.headers);
    if (state.userId !== null && endpoint !== "login") headers.set(EXPECTED_USER_HEADER, String(state.userId));
    const current = () => {
        const latestSignal = readSignal(role);
        if (latestSignal !== null && latestSignal !== state.signal) {
            state.signal = latestSignal;
            invalidate(state, role);
        }
        return generation === state.generation && (endpoint !== "me" || lookup === state.lookup);
    };
    const response = await transport(url, { ...init, headers }, (url, init) =>
        current() ? fetch(url, init) : Promise.resolve(staleResponse()));
    if (!current()) return staleResponse();
    const authEndpoint = ["me", "login", "logout", "password"].includes(endpoint ?? "");
    // Do not clone/parse large successful business payloads or binary downloads.
    const payload = !response.ok || authEndpoint
        ? await response.clone().json().catch(() => null)
        : null;
    if (!current()) return staleResponse();
    if (response.ok && payload?.success) {
        if (endpoint === "me" || endpoint === "login") {
            const id = endpoint === "me" ? payload.data?.id : payload.data?.user?.id;
            if (Number.isSafeInteger(id) && id > 0) {
                // A newly confirmed session supersedes every older response, even for the same account.
                state.generation++;
                state.userId = id;
                state.blocked = false;
            }
        }
        if (endpoint === "login" || endpoint === "logout" || endpoint === "password") {
            state.generation++;
            if (endpoint === "logout") { state.userId = null; state.blocked = true; }
            publish(browser, state, role);
        }
    } else {
        notifyAuthExpired(response, payload?.error?.code, role, () => {
            state.generation++;
            state.userId = null;
            state.blocked = true;
        });
    }
    return response;
}

export function subscribeAuthExpired(role: AuthRole, listener: () => void) {
    browserAuth();
    const handler = (event: Event) => {
        const eventRole = (event as CustomEvent<{ role?: AuthRole }>).detail?.role;
        if (!eventRole || eventRole === role) listener();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
}
