import { eq } from "drizzle-orm";
import { db } from "../../db";
import { admin } from "../../db/schema";
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { DEV_AUTH_MODE } from "../../lib/dev-mode";
import { buildSessionCookie, clearSessionCookie, error, isSecureRequest, json, parseBody, stringValue } from "../../server/http";
import { failedLoginMessage, isLoginLocked, nextFailedLoginState } from "../../server/login-lockout";
import {
    clearOtherUserSessionsForUser,
    createUserSession,
    deleteUserSessionByToken,
    loadActiveUserSession,
    readSessionToken,
} from "../../server/user-session";
import type { RouteDefinition, RouteHandler } from "../../server/route-types";

export const ADMIN_USER_TYPE = 1;
export const ADMIN_SESSION_COOKIE = "admin_session";

const ADMIN_AUTH_CACHE = Symbol("admin_auth");
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$w/hP7Qg4tzkpJ83osQKCIhfaHH+AXgyU4icxg2s1sPE$PhYwmBc6O4HkfHsMpS1CoAMXJAGNfXo/vlEUxw0c+zU";

export interface AdminInfo {
    id: number;
    username: string;
    isFirstLogin: number;
}

export interface AdminAuthOptions {
    allowFirstLogin?: boolean;
}

interface AdminAuthResult {
    admin: AdminInfo | null;
    error: Response | null;
}

type AdminRequestContext = Request & { [ADMIN_AUTH_CACHE]?: AdminAuthResult };

function applyAdminPasswordGate(result: AdminAuthResult, options: AdminAuthOptions): AdminAuthResult {
    if (!DEV_AUTH_MODE && result.admin?.isFirstLogin === 1 && !options.allowFirstLogin) {
        return {
            admin: null,
            error: error("首次登录请先修改密码", "PASSWORD_CHANGE_REQUIRED", 403),
        };
    }
    return result;
}

export function getAdminAuth(req: Request): AdminAuthResult {
    const auth = (req as AdminRequestContext)[ADMIN_AUTH_CACHE];
    if (!auth) throw new Error("Admin auth context is unavailable. Wrap the route with withAdminAuth.");
    return auth;
}

export function getAdminUser(req: Request) {
    const auth = getAdminAuth(req);
    if (!auth.admin) throw new Error("Admin user is unavailable. Wrap the route with withAdminAuth.");
    return auth.admin;
}

export async function requireAdminAuth(req: Request, options: AdminAuthOptions = {}): Promise<AdminAuthResult> {
    const cached = (req as AdminRequestContext)[ADMIN_AUTH_CACHE];
    if (cached) return applyAdminPasswordGate(cached, options);

    const currentSession = await loadActiveUserSession(req, ADMIN_SESSION_COOKIE, [ADMIN_USER_TYPE]);
    if (!currentSession.session) {
        const result = { admin: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as AdminRequestContext)[ADMIN_AUTH_CACHE] = result;
        return result;
    }

    const [row] = await db
        .select({ id: admin.id, username: admin.username, isFirstLogin: admin.isFirstLogin })
        .from(admin)
        .where(eq(admin.id, currentSession.session.userId));

    const result: AdminAuthResult = row
        ? { admin: row, error: null }
        : { admin: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
    (req as AdminRequestContext)[ADMIN_AUTH_CACHE] = result;
    return applyAdminPasswordGate(result, options);
}

function wrapRoute(handler: RouteHandler | undefined, options: AdminAuthOptions): RouteHandler | undefined {
    if (!handler) return undefined;
    return async (req) => {
        const auth = await requireAdminAuth(req, options);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withAdminAuth(routes: RouteDefinition, options: AdminAuthOptions = {}): RouteDefinition {
    return {
        GET: wrapRoute(routes.GET, options),
        POST: wrapRoute(routes.POST, options),
        PUT: wrapRoute(routes.PUT, options),
        DELETE: wrapRoute(routes.DELETE, options),
    };
}

const adminLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ username?: string; password?: string }>(req);
        const username = stringValue(body.username).trim();
        const password = stringValue(body.password);
        if (!username || !password) return error("请输入用户名和密码", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(admin).where(eq(admin.username, username));
        const valid = row
            ? await Bun.password.verify(password, row.password)
            : await Bun.password.verify(password, DUMMY_PASSWORD_HASH).then(() => false).catch(() => false);
        if (!row || isLoginLocked(row)) return error("用户名或密码错误", "INVALID_CREDENTIALS", 401);
        if (!valid) {
            const failure = nextFailedLoginState(row);
            await db.update(admin).set({ loginFailCount: failure.loginFailCount, lockedUntil: failure.lockedUntil }).where(eq(admin.id, row.id));
            return error(failedLoginMessage(failure, "用户名或密码错误"), "INVALID_CREDENTIALS", 401);
        }

        await db.update(admin).set({ loginFailCount: 0, lockedUntil: null }).where(eq(admin.id, row.id));

        const { token, expiresAt } = await createUserSession(ADMIN_USER_TYPE, row.id);
        return json(
            { user: { id: row.id, username: row.username, isFirstLogin: row.isFirstLogin } },
            200,
            { "Set-Cookie": buildSessionCookie(ADMIN_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)) },
        );
    },
};

const adminMeRoutes: RouteDefinition = {
    GET(req) {
        return json(getAdminUser(req));
    },
};

const adminLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = readSessionToken(req, ADMIN_SESSION_COOKIE);
        if (token) await deleteUserSessionByToken(token);
        return json(
            { ok: true },
            200,
            { "Set-Cookie": clearSessionCookie(ADMIN_SESSION_COOKIE, isSecureRequest(req)) },
        );
    },
};

const adminPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const current = getAdminUser(req);
        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = stringValue(body.currentPassword);
        const newPassword = stringValue(body.newPassword);
        if (!currentPassword || !newPassword) return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        if (currentPassword === newPassword) return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(admin).where(eq(admin.id, current.id));
        if (!row) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        if (!(await Bun.password.verify(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: ADMIN_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [current.username],
        });
        if (!policy.isPolicyValid) return error(ADMIN_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);

        const currentToken = readSessionToken(req, ADMIN_SESSION_COOKIE);
        if (!currentToken) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        await db
            .update(admin)
            .set({ password: await Bun.password.hash(newPassword), isFirstLogin: 0, loginFailCount: 0, lockedUntil: null, updatedAt: new Date() })
            .where(eq(admin.id, current.id));
        await clearOtherUserSessionsForUser(ADMIN_USER_TYPE, current.id, currentToken);
        return json({ success: true });
    },
};

export { adminLoginRoutes, adminLogoutRoutes, adminMeRoutes, adminPasswordRoutes };
