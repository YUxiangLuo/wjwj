export const AUTH_EXPIRED_EVENT = "wj:auth-expired";

const AUTH_EXPIRY_CODES = new Set(["UNAUTHORIZED", "SESSION_EXPIRED"]);

export function notifyAuthExpired(response: Pick<Response, "status">, errorCode?: string) {
    if (response.status === 401 && errorCode && AUTH_EXPIRY_CODES.has(errorCode) && typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
}
