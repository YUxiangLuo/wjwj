export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers });
}

export function error(message: string, code: string, status = 400): Response {
    return Response.json({ success: false, error: { code, message } }, { status });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getHeaderFirstValue(req: Request, name: string) {
    return req.headers.get(name)?.split(",")[0]?.trim() || null;
}

function getRequestOrigin(req: Request) {
    const url = new URL(req.url);
    const forwardedProto = getHeaderFirstValue(req, "x-forwarded-proto");
    const forwardedHost = getHeaderFirstValue(req, "x-forwarded-host");
    const protocol = forwardedProto || url.protocol.replace(/:$/, "");
    const host = forwardedHost || req.headers.get("host") || url.host;
    return new URL(`${protocol}://${host}`).origin;
}

function parseOrigin(value: string | null) {
    if (!value || value === "null") return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

export function isSameOriginWriteRequest(req: Request) {
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    const secFetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
    if (secFetchSite === "cross-site") return false;

    const expectedOrigin = getRequestOrigin(req);
    const origin = req.headers.get("origin");
    if (origin !== null) {
        return parseOrigin(origin) === expectedOrigin;
    }

    const referer = req.headers.get("referer");
    if (referer !== null) {
        return parseOrigin(referer) === expectedOrigin;
    }

    return true;
}

export function rejectCrossSiteRequest(req: Request): Response | null {
    if (isSameOriginWriteRequest(req)) return null;
    return error("跨站请求已拒绝", "CSRF_ORIGIN_MISMATCH", 403);
}

export async function parseBody<T>(req: Request): Promise<T> {
    return req.json() as Promise<T>;
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
