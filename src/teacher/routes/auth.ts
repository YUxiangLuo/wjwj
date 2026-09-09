import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { teacher } from "../../db/schema";
import { TEACHER_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { buildSessionCookie, error, isSecureRequest, json, parseBody, stringValue } from "../../server/http";
import { hashPassword, verifyPassword } from "../../server/password-work";
import type { RouteDefinition, RouteHandler } from "../../server/route-types";
import {
    createUserSession,
    logoutUserSession,
    sessionChangedError,
    loadActiveUserSession,
    rotateUserSession,
} from "../../server/user-session";

export const TEACHER_USER_TYPE = 2;
export const TEACHER_SESSION_COOKIE = "teacher_session";

const TEACHER_AUTH_CACHE = Symbol("teacher_auth");

export interface AuthUser {
    id: number;
    type: "teacher";
    name: string;
    employeeId: string;
}

interface TeacherAuthResult {
    user: AuthUser | null;
    error: Response | null;
}

type TeacherRequestContext = Request & { [TEACHER_AUTH_CACHE]?: TeacherAuthResult };

export function getTeacherAuth(req: Request): TeacherAuthResult {
    const auth = (req as TeacherRequestContext)[TEACHER_AUTH_CACHE];
    if (!auth) throw new Error("Teacher auth context is unavailable. Wrap the route with withTeacherAuth.");
    return auth;
}

export function getTeacherUser(req: Request) {
    const auth = getTeacherAuth(req);
    if (!auth.user) throw new Error("Teacher user is unavailable. Wrap the route with withTeacherAuth.");
    return auth.user;
}

export function getPrimaryTeacherIdOrThrow(req: Request) {
    return getTeacherUser(req).id;
}

export async function requireTeacherAuth(req: Request): Promise<TeacherAuthResult> {
    const cached = (req as TeacherRequestContext)[TEACHER_AUTH_CACHE];
    if (cached) return cached;

    const currentSession = await loadActiveUserSession(req, TEACHER_SESSION_COOKIE, [TEACHER_USER_TYPE]);
    if (!currentSession.session) {
        const result = { user: null, error: currentSession.failure === "identity_changed" ? sessionChangedError() : error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] = result;
        return result;
    }

    const [row] = await db
        .select({
            id: teacher.id,
            employeeId: teacher.employeeId,
            name: teacher.name,
            status: teacher.status,
        })
        .from(teacher)
        .where(eq(teacher.id, currentSession.session.userId));

    let result: TeacherAuthResult;
    if (!row) {
        result = { user: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
    } else if (row.status !== 1) {
        result = { user: null, error: error("账号已停用，请联系管理员", "ACCOUNT_DISABLED", 403) };
    } else {
        result = {
            user: {
                id: row.id,
                type: "teacher",
                name: row.name,
                employeeId: row.employeeId,
            },
            error: null,
        };
    }

    (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] = result;
    return result;
}

function wrapRoute(handler: RouteHandler | undefined): RouteHandler | undefined {
    if (!handler) return undefined;
    return async (req) => {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withTeacherAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: wrapRoute(routes.GET),
        POST: wrapRoute(routes.POST),
        PUT: wrapRoute(routes.PUT),
        DELETE: wrapRoute(routes.DELETE),
    };
}

const teacherLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ employeeId?: string; password?: string }>(req);
        const employeeId = stringValue(body.employeeId).trim();
        const password = stringValue(body.password);
        if (!employeeId || !password) return error("请输入工号和密码", "VALIDATION_ERROR", 400);
        const [row] = await db.select().from(teacher).where(eq(teacher.employeeId, employeeId));
        if (!row || row.status !== 1) {
            return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
        }
        if (!(await verifyPassword(password, row.password))) {
            return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const session = await db.transaction(async (tx) => {
            // Serialize issuance with disable/reset/delete and recheck the verified hash.
            const [active] = await tx.select({ id: teacher.id }).from(teacher)
                .where(and(eq(teacher.id, row.id), eq(teacher.password, row.password), eq(teacher.status, 1))).for("update");
            return active ? createUserSession(TEACHER_USER_TYPE, row.id, tx) : null;
        });
        if (!session) return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json(
            {
                user: {
                    id: row.id,
                    type: "teacher",
                    name: row.name,
                    employeeId: row.employeeId,
                },
            },
            200,
            { "Set-Cookie": buildSessionCookie(TEACHER_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)) },
        );
    },
};

const teacherMeRoutes: RouteDefinition = {
    GET(req) {
        return json(getTeacherUser(req));
    },
};

const teacherLogoutRoutes: RouteDefinition = {
    async POST(req) {
        return logoutUserSession(req, TEACHER_SESSION_COOKIE, TEACHER_USER_TYPE);
    },
};

const teacherPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const current = getTeacherUser(req);
        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = stringValue(body.currentPassword);
        const newPassword = stringValue(body.newPassword);
        if (!currentPassword || !newPassword) return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        if (currentPassword === newPassword) return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(teacher).where(eq(teacher.id, current.id));
        if (!row) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        if (!(await verifyPassword(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: TEACHER_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [current.employeeId],
        });
        if (!policy.isPolicyValid) return error(TEACHER_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);

        const passwordHash = await hashPassword(newPassword);
        const session = await db.transaction(async (tx) => {
            const changed = await tx.update(teacher)
                .set({ password: passwordHash, updatedAt: new Date() })
                .where(and(eq(teacher.id, current.id), eq(teacher.password, row.password), eq(teacher.status, 1)))
                .returning({ id: teacher.id });
            return changed.length ? rotateUserSession(TEACHER_USER_TYPE, current.id, tx) : null;
        });
        if (!session) return error("账户状态已变化，请重新登录", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json({ success: true }, 200, {
            "Set-Cookie": buildSessionCookie(TEACHER_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)),
        });
    },
};

export { teacherLoginRoutes, teacherLogoutRoutes, teacherMeRoutes, teacherPasswordRoutes };
