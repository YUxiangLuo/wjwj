import { WorkerServiceError } from "./worker-service";
import { ResearchAnalysisError } from "../domain/experiment/research-analysis";
import { InvalidJsonbStorageError } from "../lib/stored-document";
import { InvalidQuestionnaireStorageError } from "../lib/questionnaire-storage";

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

export function withPrivateApiHeaders(response: Response): Response {
    const headers = buildResponseHeaders(response.headers);
    headers.set("Cache-Control", "no-store, private");
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export function validateApiRequest(req: Request): Response | null {
    if (!(["POST", "PUT", "PATCH", "DELETE"] as const).includes(req.method as "POST")) return null;
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") return error("不允许跨站请求", "CROSS_SITE_REQUEST", 403);
    const origin = req.headers.get("origin");
    if (origin && origin !== getEffectiveRequestOrigin(req)) return error("请求来源无效", "INVALID_ORIGIN", 403);
    const referer = req.headers.get("referer");
    if (!origin && referer) {
        try {
            if (new URL(referer).origin !== getEffectiveRequestOrigin(req)) {
                return error("请求来源无效", "INVALID_ORIGIN", 403);
            }
        } catch {
            return error("请求来源无效", "INVALID_ORIGIN", 403);
        }
    }

    if (req.body) {
        const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType !== "application/json" && contentType !== "multipart/form-data") {
            return error("请求媒体类型无效", "UNSUPPORTED_MEDIA_TYPE", 415);
        }
    }
    return null;
}

export function getEffectiveRequestOrigin(req: Request) {
    if (process.env.TRUST_PROXY === "1") {
        const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
        const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
            || req.headers.get("host")?.trim();
        if ((protocol === "http" || protocol === "https") && host) {
            try {
                return new URL(`${protocol}://${host}`).origin;
            } catch {
                return "";
            }
        }
    }
    return new URL(req.url).origin;
}

export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers: buildResponseHeaders(headers) });
}

export function error(message: string, code: string, status = 400, headers?: HeadersInit): Response {
    return Response.json(
        { success: false, error: { code, message } },
        { status, headers: buildResponseHeaders(headers) },
    );
}

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export class RequestBodyTooLargeError extends Error {
    constructor(message = "JSON 请求体不能超过 256 KiB") {
        super(message);
        this.name = "RequestBodyTooLargeError";
    }
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
    const declaredLength = req.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && BigInt(declaredLength) > BigInt(MAX_JSON_BODY_BYTES)) {
        throw new RequestBodyTooLargeError();
    }

    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_JSON_BODY_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new RequestBodyTooLargeError();
            }
            chunks.push(value);
        }
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new InvalidJsonError();
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidJsonError("请求体必须是 JSON 对象");
    }
    return parsed as T;
}

export function handleServerError(cause: unknown): Response {
    if (cause instanceof ResearchAnalysisError) return error(cause.message, cause.code, cause.status);
    if (cause instanceof InvalidJsonbStorageError) return error(cause.message, "INVALID_JSONB_STORAGE", 409);
    if (cause instanceof InvalidQuestionnaireStorageError) {
        return error(cause.message, "INVALID_QUESTIONNAIRE_STORAGE", 409);
    }
    if (cause instanceof InvalidFormDataError) {
        return error(cause.message, "INVALID_FORM_DATA", 400);
    }
    if (cause instanceof Error && cause.name === "PasswordWorkQueueFullError") {
        return error("密码服务繁忙，请稍后重试", "AUTH_BUSY", 429, { "Retry-After": "1" });
    }
    if (cause instanceof WorkerServiceError) {
        return error(cause.message, cause.code, cause.status,
            cause.status === 503 ? { "Retry-After": "1" } : undefined);
    }
    if (cause instanceof Error && cause.name === "AbortError") {
        return error("请求已取消", "REQUEST_ABORTED", 499);
    }
    if (cause instanceof RequestBodyTooLargeError) {
        return error(cause.message, "PAYLOAD_TOO_LARGE", 413);
    }
    if (cause instanceof InvalidJsonError) {
        return error(cause.message, "INVALID_JSON", 400);
    }

    // Drizzle wraps Bun's PostgreSQL error in Error.cause. A concurrent
    // insert may race the friendly duplicate preflight in a route.
    let databaseCause: unknown = cause;
    for (let depth = 0; depth < 5 && databaseCause instanceof Error; depth++) {
        const details = databaseCause as Error & { errno?: string; code?: string };
        if (details.errno === "23505" || details.code === "23505") {
            return error("数据已存在或已被其他操作更新，请刷新后重试", "CONFLICT", 409);
        }
        databaseCause = databaseCause.cause;
    }

    if (process.env.NODE_ENV === "production") {
        const issue = cause instanceof Error
            ? { name: cause.name, message: cause.message.slice(0, 500) }
            : { name: "NonError", message: "Unexpected non-Error exception" };
        console.error("server_request_failed", issue);
    } else {
        console.error(cause);
    }
    return error("服务器内部错误", "INTERNAL_ERROR", 500);
}

export function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
}

export class InvalidFormDataError extends Error {
    constructor() {
        super("上传请求格式无效，请重新选择文件后重试");
        this.name = "InvalidFormDataError";
    }
}

export async function parseFormData(req: Request): Promise<FormData> {
    try {
        return await req.formData();
    } catch {
        throw new InvalidFormDataError();
    }
}

export function getRouteParam(req: Request, name: string): string | null {
    const routedReq = req as Request & { params?: Record<string, string> };
    return routedReq.params?.[name] ?? null;
}

export function parsePositiveInteger(value: string | null | undefined): number | null {
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parsePagination(params: URLSearchParams) {
    const page = params.has("page") ? parsePositiveInteger(params.get("page")) : 1;
    const requestedSize = params.has("pageSize") ? parsePositiveInteger(params.get("pageSize")) : 20;
    if (page === null || requestedSize === null) return null;
    const pageSize = Math.min(100, requestedSize);
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) return null;
    return { page, pageSize, offset };
}

export function getPositiveRouteId(req: Request, name = "id") {
    return parsePositiveInteger(getRouteParam(req, name));
}

export function getCookieValue(req: Request, name: string): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match?.[1] ?? null;
}

export function isSecureRequest(req: Request) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    if (process.env.TRUST_PROXY === "1" && forwardedProto) {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }
    return new URL(req.url).protocol === "https:";
}

export function buildSessionCookie(cookieName: string, token: string, expiresAt: Date, secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()};${secureFlag}`;
}
