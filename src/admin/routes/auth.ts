import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { admin } from "../../db/schema";
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { buildSessionCookie, error, isSecureRequest, json, parseBody, stringValue } from "../../server/http";
import { hashPassword, verifyPassword } from "../../server/password-work";
import {
    createUserSession,
    logoutUserSession,
    sessionChangedError,
    loadActiveUserSession,
    rotateUserSession,
} from "../../server/user-session";
import type { RouteDefinition, RouteHandler } from "../../server/route-types";

export const ADMIN_USER_TYPE = 1;
export const ADMIN_SESSION_COOKIE = "admin_session";

const ADMIN_AUTH_CACHE = Symbol("admin_auth");

export interface AdminInfo {
    id: number;
    username: string;
}

interface AdminAuthResult {
    admin: AdminInfo | null;
    error: Response | null;
}

type AdminRequestContext = Request & { [ADMIN_AUTH_CACHE]?: AdminAuthResult };

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

export async function requireAdminAuth(req: Request): Promise<AdminAuthResult> {
    const cached = (req as AdminRequestContext)[ADMIN_AUTH_CACHE];
    if (cached) return cached;

    const currentSession = await loadActiveUserSession(req, ADMIN_SESSION_COOKIE, [ADMIN_USER_TYPE]);
    if (!currentSession.session) {
        const result = { admin: null, error: currentSession.failure === "identity_changed" ? sessionChangedError() : error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as AdminRequestContext)[ADMIN_AUTH_CACHE] = result;
        return result;
    }

    const [row] = await db
        .select({ id: admin.id, username: admin.username })
        .from(admin)
        .where(eq(admin.id, currentSession.session.userId));

    const result: AdminAuthResult = row
        ? { admin: row, error: null }
        : { admin: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
    (req as AdminRequestContext)[ADMIN_AUTH_CACHE] = result;
    return result;
}

function wrapRoute(handler: RouteHandler | undefined): RouteHandler | undefined {
    if (!handler) return undefined;
    return async (req) => {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withAdminAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: wrapRoute(routes.GET),
        POST: wrapRoute(routes.POST),
        PUT: wrapRoute(routes.PUT),
        DELETE: wrapRoute(routes.DELETE),
    };
}

const adminLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ username?: string; password?: string }>(req);
        const username = stringValue(body.username).trim();
        const password = stringValue(body.password);
        if (!username || !password) return error("请输入用户名和密码", "VALIDATION_ERROR", 400);
        const [row] = await db.select().from(admin).where(eq(admin.username, username));
        if (!row || !(await verifyPassword(password, row.password))) {
            return error("用户名或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const session = await db.transaction(async (tx) => {
            // Serialize issuance with disable/reset/delete and recheck the verified hash.
            const [active] = await tx.select({ id: admin.id }).from(admin)
                .where(and(eq(admin.id, row.id), eq(admin.password, row.password))).for("update");
            return active ? createUserSession(ADMIN_USER_TYPE, row.id, tx) : null;
        });
        if (!session) return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json(
            { user: { id: row.id, username: row.username } },
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
        return logoutUserSession(req, ADMIN_SESSION_COOKIE, ADMIN_USER_TYPE);
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
        if (!(await verifyPassword(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: ADMIN_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [current.username],
        });
        if (!policy.isPolicyValid) return error(ADMIN_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);

        const passwordHash = await hashPassword(newPassword);
        const session = await db.transaction(async (tx) => {
            const changed = await tx.update(admin)
                .set({ password: passwordHash, updatedAt: new Date() })
                .where(and(eq(admin.id, current.id), eq(admin.password, row.password)))
                .returning({ id: admin.id });
            return changed.length ? rotateUserSession(ADMIN_USER_TYPE, current.id, tx) : null;
        });
        if (!session) return error("账户状态已变化，请重新登录", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json({ success: true }, 200, {
            "Set-Cookie": buildSessionCookie(ADMIN_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)),
        });
    },
};

export { adminLoginRoutes, adminLogoutRoutes, adminMeRoutes, adminPasswordRoutes };
