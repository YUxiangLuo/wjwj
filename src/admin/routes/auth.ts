import { eq } from "drizzle-orm";
import { db } from "../../db";
import { admin, operationLog } from "../../db/schema";
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import {
    buildSessionCookie,
    clearSessionCookie,
    error,
    getClientIp,
    isSecureRequest,
    json,
    parseBody,
} from "../../server/http";
import { getConfigNumber } from "../../server/system-config";
import {
    clearUserSessionForUser,
    createSingleUserSession,
    deleteUserSessionByToken,
    extendUserSession,
    loadActiveUserSession,
    readSessionToken,
    recordLoginLog,
} from "../../server/user-session";
import type { RouteDefinition, RouteHandler } from "../../server/route-types";

export const ADMIN_USER_TYPE = 1;
export const ADMIN_SESSION_COOKIE = "admin_session";
const DEFAULT_ADMIN_SESSION_TTL_MINUTES = 30;
const DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOCK_MINUTES = 30;
const ADMIN_AUTH_CACHE = Symbol("admin_auth");

export interface AdminInfo {
    id: number;
    username: string;
    isFirstLogin: number;
}

interface AdminAuthSession {
    id: number;
    sessionToken: string;
    userType: number;
    userId: number;
    expiresAt: Date;
}

interface AdminAuthResult {
    admin: AdminInfo | null;
    error: Response | null;
    session?: AdminAuthSession;
}

type AdminRequestContext = Request & {
    [ADMIN_AUTH_CACHE]?: AdminAuthResult;
};

function readAdminAuthCache(req: Request): AdminAuthResult | null {
    return (req as AdminRequestContext)[ADMIN_AUTH_CACHE] ?? null;
}

function writeAdminAuthCache(req: Request, auth: AdminAuthResult) {
    (req as AdminRequestContext)[ADMIN_AUTH_CACHE] = auth;
}

export function getAdminAuth(req: Request): AdminAuthResult {
    const cached = readAdminAuthCache(req);
    if (!cached) {
        throw new Error("Admin auth context is unavailable. Wrap the route with withAdminAuth or call requireAdminAuth first.");
    }
    return cached;
}

export function getAdminUser(req: Request): AdminInfo {
    const auth = getAdminAuth(req);
    if (!auth.admin) {
        throw new Error("Admin user is unavailable. Wrap the route with withAdminAuth.");
    }
    return auth.admin;
}

export async function requireAdminAuth(req: Request): Promise<AdminAuthResult> {
    const cached = readAdminAuthCache(req);
    if (cached) return cached;

    const auth = await (async () => {
        const currentSession = await loadActiveUserSession(
            req,
            { cookieName: ADMIN_SESSION_COOKIE, headerName: "x-admin-session" },
            [ADMIN_USER_TYPE]
        );
        if (!currentSession.session) {
            return { admin: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        }

        const [adm] = await db
            .select({ id: admin.id, username: admin.username, isFirstLogin: admin.isFirstLogin })
            .from(admin)
            .where(eq(admin.id, currentSession.session.userId));

        if (!adm) {
            return { admin: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
        }

        const { expiresAt } = await extendUserSession(
            currentSession.session.id,
            "session.admin_timeout_minutes",
            DEFAULT_ADMIN_SESSION_TTL_MINUTES
        );

        return { admin: adm, error: null, session: { ...currentSession.session, expiresAt } };
    })();

    writeAdminAuthCache(req, auth);
    return auth;
}

function wrapAdminRoute(handler?: RouteHandler): RouteHandler | undefined {
    if (!handler) {
        return undefined;
    }

    return async (req) => {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withAdminAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: wrapAdminRoute(routes.GET),
        POST: wrapAdminRoute(routes.POST),
        PUT: wrapAdminRoute(routes.PUT),
        DELETE: wrapAdminRoute(routes.DELETE),
    };
}

const adminLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ username: string; password: string }>(req);
        const username = body.username?.trim();
        const password = body.password ?? "";

        if (!username || !password) {
            return error("请输入用户名和密码", "VALIDATION_ERROR", 400);
        }

        const [adm] = await db.select().from(admin).where(eq(admin.username, username));

        if (!adm) {
            // Perform a dummy hash verification to prevent timing-based user enumeration
            await Bun.password.verify(password, "$argon2id$v=19$m=65536,t=2,p=1$w/hP7Qg4tzkpJ83osQKCIhfaHH+AXgyU4icxg2s1sPE$PhYwmBc6O4HkfHsMpS1CoAMXJAGNfXo/vlEUxw0c+zU").catch(() => {});
            return error("用户名或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const now = new Date();
        const maxAttempts = await getConfigNumber("login.max_fail_count", DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS);
        const lockMinutes = await getConfigNumber("login.lock_duration_minutes", DEFAULT_ADMIN_LOCK_MINUTES);
        if (adm.lockedUntil && new Date(adm.lockedUntil) > now) {
            return error("账号已锁定，请稍后再试", "ACCOUNT_LOCKED", 403);
        }

        const isValid = await Bun.password.verify(password, adm.password);
        if (!isValid) {
            const failCount = (adm.loginFailCount ?? 0) + 1;
            const updateData: { loginFailCount: number; lockedUntil?: Date } = { loginFailCount: failCount };

            if (failCount >= maxAttempts) {
                updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
            }

            await db.update(admin).set(updateData).where(eq(admin.id, adm.id));

            const remainingAttempts = Math.max(maxAttempts - failCount, 0);

            return error(
                failCount >= maxAttempts
                    ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                    : `用户名或密码错误，还剩${remainingAttempts}次尝试机会`,
                "INVALID_CREDENTIALS",
                401
            );
        }

        await db.update(admin).set({ loginFailCount: 0, lockedUntil: null }).where(eq(admin.id, adm.id));

        const { token, expiresAt } = await createSingleUserSession({
            req,
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            ttlConfigKey: "session.admin_timeout_minutes",
            defaultTtlMinutes: DEFAULT_ADMIN_SESSION_TTL_MINUTES,
        });

        await recordLoginLog(req, ADMIN_USER_TYPE, adm.id);

        const secure = isSecureRequest(req);
        return json(
            {
                user: { id: adm.id, username: adm.username, isFirstLogin: adm.isFirstLogin, sessionExpiresAt: expiresAt },
                expiresAt,
            },
            200,
            { "Set-Cookie": buildSessionCookie(ADMIN_SESSION_COOKIE, token, expiresAt, secure) }
        );
    },
};

const adminMeRoutes: RouteDefinition = {
    async GET(req) {
        const auth = getAdminAuth(req);
        const adm = getAdminUser(req);
        return json({
            ...adm,
            sessionExpiresAt: auth.session?.expiresAt ?? null,
        });
    },
};

const adminLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = readSessionToken(req, {
            cookieName: ADMIN_SESSION_COOKIE,
            headerName: "x-admin-session",
        });
        if (token) {
            await deleteUserSessionByToken(token);
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(ADMIN_SESSION_COOKIE, secure) });
    },
};

const adminPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const adm = getAdminUser(req);

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        if (newPassword === currentPassword) {
            return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);
        }

        const [admRow] = await db.select().from(admin).where(eq(admin.id, adm.id));
        if (!admRow) {
            return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        }

        const isValid = await Bun.password.verify(currentPassword, admRow.password);
        if (!isValid) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: ADMIN_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [adm.username],
        });
        if (!policy.isPolicyValid) {
            return error(ADMIN_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);
        }

        const hashed = await Bun.password.hash(newPassword);
        await db.update(admin).set({ password: hashed, isFirstLogin: 0 }).where(eq(admin.id, adm.id));

        // Invalidate other sessions but keep the current one
        const currentToken = readSessionToken(req, {
            cookieName: ADMIN_SESSION_COOKIE,
            headerName: "x-admin-session",
        });
        await clearUserSessionForUser(ADMIN_USER_TYPE, adm.id, currentToken);

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            action: "CHANGE_PASSWORD",
            targetType: "admin",
            targetId: adm.id,
            detail: { by: "self" },
            ipAddress: getClientIp(req),
        });

        return json({ success: true });
    },
};

export { adminLoginRoutes, adminLogoutRoutes, adminMeRoutes, adminPasswordRoutes };
