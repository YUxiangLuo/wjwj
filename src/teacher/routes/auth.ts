import { eq } from "drizzle-orm";
import { db } from "../../db";
import { teacher } from "../../db/schema";
import { TEACHER_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { buildSessionCookie, clearSessionCookie, error, isSecureRequest, json, parseBody } from "../../server/http";
import { failedLoginMessage, isLoginLocked, nextFailedLoginState } from "../../server/login-lockout";
import type { RouteDefinition, RouteHandler } from "../../server/route-types";
import {
    clearOtherUserSessionsForUser,
    createUserSession,
    deleteUserSessionByToken,
    loadActiveUserSession,
    readSessionToken,
} from "../../server/user-session";

export const TEACHER_USER_TYPE = 2;
export const TEACHER_SESSION_COOKIE = "teacher_session";

const TEACHER_AUTH_CACHE = Symbol("teacher_auth");
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$w/hP7Qg4tzkpJ83osQKCIhfaHH+AXgyU4icxg2s1sPE$PhYwmBc6O4HkfHsMpS1CoAMXJAGNfXo/vlEUxw0c+zU";

export interface AuthUser {
    id: number;
    type: "teacher";
    name: string;
    employeeId: string;
    isFirstLogin: number;
}

interface TeacherAuthResult {
    user: AuthUser | null;
    error: Response | null;
}

export interface TeacherAuthOptions {
    allowFirstLogin?: boolean;
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

function applyTeacherPasswordGate(result: TeacherAuthResult, options: TeacherAuthOptions): TeacherAuthResult {
    if (result.user?.isFirstLogin === 1 && !options.allowFirstLogin) {
        return {
            user: null,
            error: error("首次登录或密码已重置，请先修改密码", "PASSWORD_CHANGE_REQUIRED", 403),
        };
    }
    return result;
}

export async function requireTeacherAuth(
    req: Request,
    options: TeacherAuthOptions = {},
): Promise<TeacherAuthResult> {
    const cached = (req as TeacherRequestContext)[TEACHER_AUTH_CACHE];
    if (cached) return applyTeacherPasswordGate(cached, options);

    const currentSession = await loadActiveUserSession(req, TEACHER_SESSION_COOKIE, [TEACHER_USER_TYPE]);
    if (!currentSession.session) {
        const result = { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] = result;
        return applyTeacherPasswordGate(result, options);
    }

    const [row] = await db
        .select({
            id: teacher.id,
            employeeId: teacher.employeeId,
            name: teacher.name,
            status: teacher.status,
            isFirstLogin: teacher.isFirstLogin,
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
                isFirstLogin: row.isFirstLogin,
            },
            error: null,
        };
    }

    (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] = result;
    return applyTeacherPasswordGate(result, options);
}

function wrapRoute(handler: RouteHandler | undefined, options: TeacherAuthOptions): RouteHandler | undefined {
    if (!handler) return undefined;
    return async (req) => {
        const auth = await requireTeacherAuth(req, options);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withTeacherAuth(routes: RouteDefinition, options: TeacherAuthOptions = {}): RouteDefinition {
    return {
        GET: wrapRoute(routes.GET, options),
        POST: wrapRoute(routes.POST, options),
        PUT: wrapRoute(routes.PUT, options),
        DELETE: wrapRoute(routes.DELETE, options),
    };
}

const teacherLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ employeeId?: string; password?: string }>(req);
        const employeeId = body.employeeId?.trim() ?? "";
        const password = body.password ?? "";
        if (!employeeId || !password) return error("请输入工号和密码", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(teacher).where(eq(teacher.employeeId, employeeId));
        if (row?.status === 1 && isLoginLocked(row)) {
            return error("登录失败次数过多，账号暂时锁定，请稍后重试", "ACCOUNT_LOCKED", 423);
        }
        const valid = row
            ? await Bun.password.verify(password, row.password)
            : await Bun.password.verify(password, DUMMY_PASSWORD_HASH).then(() => false).catch(() => false);
        if (!row || row.status !== 1) return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
        if (!valid) {
            const failure = nextFailedLoginState(row);
            await db.update(teacher).set({ loginFailCount: failure.loginFailCount, lockedUntil: failure.lockedUntil }).where(eq(teacher.id, row.id));
            return error(failedLoginMessage(failure), "INVALID_CREDENTIALS", 401);
        }

        await db.update(teacher).set({ loginFailCount: 0, lockedUntil: null }).where(eq(teacher.id, row.id));

        const { token, expiresAt } = await createUserSession(TEACHER_USER_TYPE, row.id);
        return json(
            {
                user: {
                    id: row.id,
                    type: "teacher",
                    name: row.name,
                    employeeId: row.employeeId,
                    isFirstLogin: row.isFirstLogin,
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
        const token = readSessionToken(req, TEACHER_SESSION_COOKIE);
        if (token) await deleteUserSessionByToken(token);
        return json(
            { ok: true },
            200,
            { "Set-Cookie": clearSessionCookie(TEACHER_SESSION_COOKIE, isSecureRequest(req)) },
        );
    },
};

const teacherPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const current = getTeacherUser(req);
        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";
        if (!currentPassword || !newPassword) return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        if (currentPassword === newPassword) return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(teacher).where(eq(teacher.id, current.id));
        if (!row) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        if (!(await Bun.password.verify(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: TEACHER_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [current.employeeId],
        });
        if (!policy.isPolicyValid) return error(TEACHER_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);

        const currentToken = readSessionToken(req, TEACHER_SESSION_COOKIE);
        if (!currentToken) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        await db
            .update(teacher)
            .set({ password: await Bun.password.hash(newPassword), isFirstLogin: 0, loginFailCount: 0, lockedUntil: null, updatedAt: new Date() })
            .where(eq(teacher.id, current.id));
        await clearOtherUserSessionsForUser(TEACHER_USER_TYPE, current.id, currentToken);
        return json({ success: true });
    },
};

export { teacherLoginRoutes, teacherLogoutRoutes, teacherMeRoutes, teacherPasswordRoutes };
