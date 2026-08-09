const SECURITY_HEADERS = {
    "Content-Security-Policy": [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-src 'self' blob:",
        "worker-src 'self' blob:",
    ].join("; "),
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
} as const;

export function buildResponseHeaders(headers?: HeadersInit): Headers {
    const result = new Headers(headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!result.has(name)) result.set(name, value);
    }
    return result;
}

export function withSecurityHeaders(response: Response): Response {
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: buildResponseHeaders(response.headers),
    });
}

export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers: buildResponseHeaders(headers) });
}

export function error(message: string, code: string, status = 400): Response {
    return Response.json(
        { success: false, error: { code, message } },
        { status, headers: buildResponseHeaders() },
    );
}

export class InvalidJsonError extends Error {
    constructor(message = "请求体不是有效的 JSON") {
        super(message);
        this.name = "InvalidJsonError";
    }
}

export function stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export async function parseBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
    let parsed: unknown;
    try {
        parsed = await req.json();
    } catch {
        throw new InvalidJsonError();
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidJsonError("请求体必须是 JSON 对象");
    }
    return parsed as T;
}

export function handleServerError(cause: unknown): Response {
    if (cause instanceof InvalidJsonError) {
        return error(cause.message, "INVALID_JSON", 400);
    }

    console.error(cause);
    return error("服务器内部错误", "INTERNAL_ERROR", 500);
}

export function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
}

export function getRouteParam(req: Request, name: string): string | null {
    const routedReq = req as Request & { params?: Record<string, string> };
    return routedReq.params?.[name] ?? null;
}

export function getCookieValue(req: Request, name: string): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match?.[1] ?? null;
}

export function getClientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
    return req.headers.get("x-real-ip") ?? "";
}

export function isSecureRequest(req: Request) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    if (forwardedProto) {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }
    return new URL(req.url).protocol === "https:";
}

export function buildSessionCookie(cookieName: string, token: string, expiresAt: Date, secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()};${secureFlag}`;
}

export function clearSessionCookie(cookieName: string, secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT;${secureFlag}`;
}
