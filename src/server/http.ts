export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers });
}

export function error(message: string, code: string, status = 400): Response {
    return Response.json({ success: false, error: { code, message } }, { status });
}

export async function parseBody<T>(req: Request): Promise<T> {
    return req.json() as Promise<T>;
}

export function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
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
