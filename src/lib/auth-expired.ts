export const AUTH_EXPIRED_EVENT = "wj:auth-expired";

export function isAuthTerminalError(status: number, code?: string) {
    return (status === 401 && ["UNAUTHORIZED", "SESSION_EXPIRED", "ACCOUNT_NOT_FOUND"].includes(code ?? ""))
        || (status === 403 && code === "ACCOUNT_DISABLED")
        || (status === 409 && code === "SESSION_CHANGED");
}

export function notifyAuthExpired(response: Pick<Response, "status">, errorCode?: string, role?: string, beforeNotify?: () => void) {
    if (isAuthTerminalError(response.status, errorCode) && typeof window !== "undefined") {
        beforeNotify?.();
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { role } }));
    }
}

export async function notifyAuthExpiredFromResponse(response: Response) {
    if (![401, 403, 409].includes(response.status)) return;

    try {
        const payload = await response.clone().json() as { error?: { code?: unknown } };
        const code = typeof payload.error?.code === "string" ? payload.error.code : undefined;
        notifyAuthExpired(response, code);
    } catch {
        // Binary endpoints may return a non-JSON error; only known auth error codes expire the UI session.
    }
}
