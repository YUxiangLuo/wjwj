export const AUTH_EXPIRED_EVENT = "wj:auth-expired";

const AUTH_EXPIRY_CODES = new Set(["UNAUTHORIZED", "SESSION_EXPIRED"]);

export function notifyAuthExpired(response: Pick<Response, "status">, errorCode?: string) {
    if (response.status === 401 && errorCode && AUTH_EXPIRY_CODES.has(errorCode) && typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
}

export async function notifyAuthExpiredFromResponse(response: Response) {
    if (response.status !== 401) return;

    try {
        const payload = await response.clone().json() as { error?: { code?: unknown } };
        const code = typeof payload.error?.code === "string" ? payload.error.code : undefined;
        notifyAuthExpired(response, code);
    } catch {
        // Binary endpoints may return a non-JSON error; only known auth error codes expire the UI session.
    }
}
