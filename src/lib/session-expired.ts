const SESSION_EXPIRED_ERROR_CODES = new Set(["AUTH_004", "AUTH_005", "UNAUTHORIZED", "ACCOUNT_NOT_FOUND"]);

export function shouldDispatchSessionExpired(
    url: string,
    status: number,
    response: { error?: { code?: string; message?: string } } | null | undefined,
    loginPathSegment: string,
) {
    if (status !== 401 || url.includes(loginPathSegment)) return false;
    return SESSION_EXPIRED_ERROR_CODES.has(response?.error?.code ?? "");
}

export function createSessionExpiredInterceptor(
    loginPathSegment: string,
    eventName: string,
) {
    return function dispatchIfSessionExpired(
        url: string,
        status: number,
        data: { error?: { code?: string; message?: string } } | null | undefined,
    ) {
        if (typeof window === "undefined") return;
        if (!shouldDispatchSessionExpired(url, status, data, loginPathSegment)) return;
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: { message: data?.error?.message ?? "会话已过期，请重新登录" },
        }));
    };
}
