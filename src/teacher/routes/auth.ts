import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { assistant, notification, student, teacher } from "../../db/schema";
import { TEACHER_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import {
    buildSessionCookie,
    clearSessionCookie,
    error,
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

export const TEACHER_USER_TYPE = 2;
export const ASSISTANT_USER_TYPE = 3;
const TEACHER_SESSION_COOKIE = "teacher_session";
const TEACHER_SESSION_TTL_MINUTES = 120;
const TEACHER_MAX_LOGIN_ATTEMPTS = 5;
const TEACHER_LOCK_MINUTES = 30;
const GRADING_LOCK_MINUTES = 30;
const TEACHER_AUTH_CACHE = Symbol("teacher_auth");
const PRIMARY_TEACHER_CONTEXT = Symbol("primary_teacher_context");

type NotificationDbClient = Pick<typeof db, "insert" | "select" | "update" | "delete">;

export interface AuthSession {
    id: number;
    sessionToken: string;
    userType: number;
    userId: number;
    expiresAt: Date;
}

interface TeacherAuthResult {
    user: AuthUser | null;
    error: Response | null;
    session?: AuthSession;
}

type TeacherRequestContext = Request & {
    [TEACHER_AUTH_CACHE]?: TeacherAuthResult;
    [PRIMARY_TEACHER_CONTEXT]?: number;
};

export interface AuthUser {
    id: number;
    type: "teacher" | "assistant";
    name: string;
    employeeId?: string;
    account?: string;
    isFirstLogin: number;
    creatorTeacherId?: number;
}

function setPrimaryTeacherContext(req: Request, teacherId: number) {
    (req as TeacherRequestContext)[PRIMARY_TEACHER_CONTEXT] = teacherId;
}

function readPrimaryTeacherContext(req: Request) {
    return (req as TeacherRequestContext)[PRIMARY_TEACHER_CONTEXT] ?? null;
}

function readTeacherAuthCache(req: Request): TeacherAuthResult | null {
    return (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] ?? null;
}

function writeTeacherAuthCache(req: Request, auth: TeacherAuthResult) {
    (req as TeacherRequestContext)[TEACHER_AUTH_CACHE] = auth;
}

export function getTeacherAuth(req: Request): TeacherAuthResult {
    const cached = readTeacherAuthCache(req);
    if (!cached) {
        throw new Error("Teacher auth context is unavailable. Wrap the route with withTeacherAuth or call requireTeacherAuth first.");
    }
    return cached;
}

export function getTeacherUser(req: Request): AuthUser {
    const auth = getTeacherAuth(req);
    if (!auth.user) {
        throw new Error("Teacher auth user is unavailable. Wrap the route with withTeacherAuth.");
    }
    return auth.user;
}

export function getPrimaryTeacherIdOrThrow(req: Request) {
    const teacherId = readPrimaryTeacherContext(req);
    if (teacherId == null) {
        throw new Error("Primary teacher context is unavailable. Wrap the route with withPrimaryTeacherAuth or call requirePrimaryTeacher first.");
    }

    return teacherId;
}

export function isLockExpired(lockedAt?: Date | null) {
    if (!lockedAt) return true;
    return Date.now() - new Date(lockedAt).getTime() > GRADING_LOCK_MINUTES * 60 * 1000;
}

export async function notifyStudentsByClassIds(
    classIds: number[],
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number },
    database: NotificationDbClient = db
) {
    if (!classIds.length) return;
    const students = await database
        .select({ id: student.id })
        .from(student)
        .where(and(sql`${student.classId} IN (${sql.join(classIds, sql`, `)})`, isNull(student.deletedAt)));

    if (!students.length) return;

    await database.insert(notification).values(
        students.map((s) => ({
            receiverType: 4,
            receiverId: s.id,
            type: payload.type,
            title: payload.title,
            content: payload.content,
            relatedType: payload.relatedType,
            relatedId: payload.relatedId,
        }))
    );
}

export async function notifyStudentById(
    studentId: number,
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number },
    database: NotificationDbClient = db
) {
    await database.insert(notification).values({
        receiverType: 4,
        receiverId: studentId,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId,
    });
}

export async function requireTeacherAuth(req: Request): Promise<TeacherAuthResult> {
    const cached = readTeacherAuthCache(req);
    if (cached) return cached;

    const auth = await (async () => {
        const currentSession = await loadActiveUserSession(
            req,
            { cookieName: TEACHER_SESSION_COOKIE, headerName: "x-teacher-session" },
            [TEACHER_USER_TYPE, ASSISTANT_USER_TYPE]
        );
        if (!currentSession.session || currentSession.userType == null) {
            return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        }

        if (currentSession.userType === TEACHER_USER_TYPE) {
            const [t] = await db
                .select({ id: teacher.id, employeeId: teacher.employeeId, name: teacher.name, isFirstLogin: teacher.isFirstLogin })
                .from(teacher)
                .where(eq(teacher.id, currentSession.session.userId));

            if (!t) {
                return { user: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
            }

            const { expiresAt } = await extendUserSession(
                currentSession.session.id,
                "session.teacher_timeout_minutes",
                TEACHER_SESSION_TTL_MINUTES
            );

            return {
                user: {
                    id: t.id,
                    type: "teacher" as const,
                    name: t.name,
                    employeeId: t.employeeId,
                    isFirstLogin: t.isFirstLogin,
                },
                error: null,
                session: { ...currentSession.session, expiresAt },
            };
        }

        if (currentSession.userType === ASSISTANT_USER_TYPE) {
            const [a] = await db
                .select({ id: assistant.id, account: assistant.account, name: assistant.name, isFirstLogin: assistant.isFirstLogin, creatorTeacherId: assistant.creatorTeacherId })
                .from(assistant)
                .where(eq(assistant.id, currentSession.session.userId));

            if (!a) {
                return { user: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
            }

            const { expiresAt } = await extendUserSession(
                currentSession.session.id,
                "session.teacher_timeout_minutes",
                TEACHER_SESSION_TTL_MINUTES
            );

            return {
                user: {
                    id: a.id,
                    type: "assistant" as const,
                    name: a.name,
                    account: a.account,
                    isFirstLogin: a.isFirstLogin,
                    creatorTeacherId: a.creatorTeacherId,
                },
                error: null,
                session: { ...currentSession.session, expiresAt },
            };
        }

        return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    })();

    writeTeacherAuthCache(req, auth);
    return auth;
}

export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
    return (await requireTeacherAuth(req)).user;
}

export async function getCurrentTeacherId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    if (user?.type === "teacher") return user.id;
    if (user?.type === "assistant") return user.creatorTeacherId ?? null;
    return null;
}

export async function requirePrimaryTeacher(req: Request): Promise<{ teacherId: number | null; error: Response | null }> {
    const cachedTeacherId = readPrimaryTeacherContext(req);
    if (cachedTeacherId != null) {
        return { teacherId: cachedTeacherId, error: null };
    }

    const auth = await requireTeacherAuth(req);
    // note: getOrCreateRequestCache handles dedup, so no double-query here
    if (auth.error) {
        return { teacherId: null, error: auth.error };
    }

    if (auth.user?.type !== "teacher") {
        return { teacherId: null, error: error("仅教师可执行此操作", "FORBIDDEN", 403) };
    }

    setPrimaryTeacherContext(req, auth.user.id);
    return { teacherId: auth.user.id, error: null };
}

export async function getCurrentAssistantId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    return user?.type === "assistant" ? user.id : null;
}

function wrapTeacherRoute(handler?: RouteHandler): RouteHandler | undefined {
    if (!handler) {
        return undefined;
    }

    return async (req) => {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

function wrapPrimaryTeacherRoute(handler?: RouteHandler): RouteHandler | undefined {
    if (!handler) {
        return undefined;
    }

    return async (req) => {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        return handler(req);
    };
}

export function withTeacherAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: wrapTeacherRoute(routes.GET),
        POST: wrapTeacherRoute(routes.POST),
        PUT: wrapTeacherRoute(routes.PUT),
        DELETE: wrapTeacherRoute(routes.DELETE),
    };
}

export function withPrimaryTeacherAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: wrapPrimaryTeacherRoute(routes.GET),
        POST: wrapPrimaryTeacherRoute(routes.POST),
        PUT: wrapPrimaryTeacherRoute(routes.PUT),
        DELETE: wrapPrimaryTeacherRoute(routes.DELETE),
    };
}

async function handleTeacherLogin(req: Request, t: typeof teacher.$inferSelect, password: string): Promise<Response> {
    const now = new Date();
    const maxAttempts = await getConfigNumber("login.max_fail_count", TEACHER_MAX_LOGIN_ATTEMPTS);
    const lockMinutes = await getConfigNumber("login.lock_duration_minutes", TEACHER_LOCK_MINUTES);

    if (t.lockedUntil && new Date(t.lockedUntil) > now) {
        const remainMinutes = Math.ceil((new Date(t.lockedUntil).getTime() - now.getTime()) / 60000);
        return error(`账号已被锁定，请${remainMinutes}分钟后重试`, "ACCOUNT_LOCKED", 403);
    }

    if (t.status !== 1) {
        return error("账号已停用，请联系管理员", "ACCOUNT_DISABLED", 403);
    }

    const isValid = await Bun.password.verify(password, t.password);
    if (!isValid) {
        const failCount = (t.loginFailCount ?? 0) + 1;
        const updateData: { loginFailCount: number; lockedUntil?: Date } = { loginFailCount: failCount };
        if (failCount >= maxAttempts) {
            updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
        }
        await db.update(teacher).set(updateData).where(eq(teacher.id, t.id));
        const remaining = maxAttempts - failCount;
        return error(
            failCount >= maxAttempts
                ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                : `账号或密码错误，还剩${remaining}次尝试机会`,
            "INVALID_CREDENTIALS",
            401
        );
    }

    await db.update(teacher).set({ loginFailCount: 0, lockedUntil: null }).where(eq(teacher.id, t.id));

    const { token, expiresAt } = await createSingleUserSession({
        req,
        userType: TEACHER_USER_TYPE,
        userId: t.id,
        ttlConfigKey: "session.teacher_timeout_minutes",
        defaultTtlMinutes: TEACHER_SESSION_TTL_MINUTES,
    });

    await recordLoginLog(req, TEACHER_USER_TYPE, t.id);

    const secure = isSecureRequest(req);
    return json(
        {
            user: { id: t.id, employeeId: t.employeeId, name: t.name, isFirstLogin: t.isFirstLogin, type: "teacher" },
            expiresAt,
        },
        200,
        { "Set-Cookie": buildSessionCookie(TEACHER_SESSION_COOKIE, token, expiresAt, secure) }
    );
}

async function handleAssistantLogin(req: Request, a: typeof assistant.$inferSelect, password: string): Promise<Response> {
    const now = new Date();
    const maxAttempts = await getConfigNumber("login.max_fail_count", TEACHER_MAX_LOGIN_ATTEMPTS);
    const lockMinutes = await getConfigNumber("login.lock_duration_minutes", TEACHER_LOCK_MINUTES);

    if (a.lockedUntil && new Date(a.lockedUntil) > now) {
        const remainMinutes = Math.ceil((new Date(a.lockedUntil).getTime() - now.getTime()) / 60000);
        return error(`账号已被锁定，请${remainMinutes}分钟后重试`, "ACCOUNT_LOCKED", 403);
    }

    if (a.status !== 1) {
        return error("账号已被停用，请联系教师", "ACCOUNT_DISABLED", 403);
    }

    const isValid = await Bun.password.verify(password, a.password);
    if (!isValid) {
        const failCount = (a.loginFailCount ?? 0) + 1;
        const updateData: { loginFailCount: number; lockedUntil?: Date } = { loginFailCount: failCount };
        if (failCount >= maxAttempts) {
            updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
        }
        await db.update(assistant).set(updateData).where(eq(assistant.id, a.id));
        const remaining = maxAttempts - failCount;
        return error(
            failCount >= maxAttempts
                ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                : `账号或密码错误，还剩${remaining}次尝试机会`,
            "INVALID_CREDENTIALS",
            401
        );
    }

    await db.update(assistant).set({ loginFailCount: 0, lockedUntil: null }).where(eq(assistant.id, a.id));

    const { token, expiresAt } = await createSingleUserSession({
        req,
        userType: ASSISTANT_USER_TYPE,
        userId: a.id,
        ttlConfigKey: "session.teacher_timeout_minutes",
        defaultTtlMinutes: TEACHER_SESSION_TTL_MINUTES,
    });

    await recordLoginLog(req, ASSISTANT_USER_TYPE, a.id);

    const secure = isSecureRequest(req);
    return json(
        {
            user: { id: a.id, account: a.account, name: a.name, isFirstLogin: a.isFirstLogin, type: "assistant", creatorTeacherId: a.creatorTeacherId },
            expiresAt,
        },
        200,
        { "Set-Cookie": buildSessionCookie(TEACHER_SESSION_COOKIE, token, expiresAt, secure) }
    );
}

const teacherLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ employeeId: string; password: string }>(req);
        const employeeId = body.employeeId?.trim();
        const password = body.password ?? "";

        if (!employeeId || !password) {
            return error("请输入工号和密码", "VALIDATION_ERROR", 400);
        }

        const [t] = await db.select().from(teacher).where(eq(teacher.employeeId, employeeId));
        if (t) {
            return handleTeacherLogin(req, t, password);
        }

        const [a] = await db.select().from(assistant).where(eq(assistant.account, employeeId));
        if (a) {
            return handleAssistantLogin(req, a, password);
        }

        // Perform a dummy hash verification to prevent timing-based user enumeration
        await Bun.password.verify(password, "$argon2id$v=19$m=65536,t=2,p=1$dummysaltvalue$dummyhashvalue0000000000000000000000000000000").catch(() => {});
        return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
    },
};

const teacherMeRoutes: RouteDefinition = {
    async GET(req) {
        const auth = getTeacherAuth(req);
        const user = getTeacherUser(req);
        return json({ ...user, sessionExpiresAt: auth.session?.expiresAt ?? null });
    },
};

const teacherLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = readSessionToken(req, {
            cookieName: TEACHER_SESSION_COOKIE,
            headerName: "x-teacher-session",
        });
        if (token) {
            await deleteUserSessionByToken(token);
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(TEACHER_SESSION_COOKIE, secure) });
    },
};

const teacherPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = getTeacherAuth(req);

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        if (newPassword === currentPassword) {
            return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);
        }

        const user = getTeacherUser(req);
        const accountId = user.type === "teacher" ? user.employeeId : user.account;
        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: TEACHER_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [accountId],
        });
        if (!policy.isPolicyValid) {
            return error(TEACHER_PASSWORD_POLICY.errorMessage, "VALIDATION_ERROR", 400);
        }

        if (user.type === "teacher") {
            const [t] = await db.select().from(teacher).where(eq(teacher.id, user.id));
            if (!t) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

            const isValid = await Bun.password.verify(currentPassword, t.password);
            if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

            const hashed = await Bun.password.hash(newPassword);
            await db.update(teacher).set({ password: hashed, isFirstLogin: 0 }).where(eq(teacher.id, t.id));

            // Invalidate other sessions but keep the current one
            const currentToken = readSessionToken(req, {
                cookieName: TEACHER_SESSION_COOKIE,
                headerName: "x-teacher-session",
            });
            await clearUserSessionForUser(TEACHER_USER_TYPE, t.id, currentToken);
        } else {
            const [a] = await db.select().from(assistant).where(eq(assistant.id, user.id));
            if (!a) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

            const isValid = await Bun.password.verify(currentPassword, a.password);
            if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

            const hashed = await Bun.password.hash(newPassword);
            await db.update(assistant).set({ password: hashed, isFirstLogin: 0 }).where(eq(assistant.id, a.id));

            // Invalidate other sessions but keep the current one
            const currentToken = readSessionToken(req, {
                cookieName: TEACHER_SESSION_COOKIE,
                headerName: "x-teacher-session",
            });
            await clearUserSessionForUser(ASSISTANT_USER_TYPE, a.id, currentToken);
        }

        return json({ success: true });
    },
};

export { teacherLoginRoutes, teacherLogoutRoutes, teacherMeRoutes, teacherPasswordRoutes };
