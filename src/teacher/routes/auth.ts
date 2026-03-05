import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { assistant, loginLog, notification, student, systemConfig, teacher, userSession } from "../../db/schema";
import {
    buildSessionCookie,
    clearSessionCookie,
    error,
    getClientIp,
    getCookieValue,
    isSecureRequest,
    json,
    parseBody,
} from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";

export const TEACHER_USER_TYPE = 2;
export const ASSISTANT_USER_TYPE = 3;
const TEACHER_SESSION_COOKIE = "teacher_session";
const TEACHER_SESSION_TTL_MINUTES = 120;
const TEACHER_MAX_LOGIN_ATTEMPTS = 5;
const TEACHER_LOCK_MINUTES = 30;
const GRADING_LOCK_MINUTES = 30;

export interface AuthUser {
    id: number;
    type: "teacher" | "assistant";
    name: string;
    employeeId?: string;
    account?: string;
    isFirstLogin: number;
    creatorTeacherId?: number;
}

export async function getConfigNumber(key: string, fallback: number) {
    const [row] = await db
        .select({ value: systemConfig.configValue, valueType: systemConfig.valueType })
        .from(systemConfig)
        .where(eq(systemConfig.configKey, key))
        .limit(1);

    if (!row) return fallback;
    if (row.valueType === "number") return Number(row.value);
    if (row.valueType === "boolean") return row.value === "true" ? 1 : 0;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validateTeacherPassword(password: string, account: string) {
    const minLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(password);
    const containsAccount = account && password.includes(account);

    return {
        minLength,
        hasLetter,
        hasNumber,
        hasSpecial,
        containsAccount,
        isValid: minLength && hasLetter && hasNumber && hasSpecial && !containsAccount,
    };
}

export function isLockExpired(lockedAt?: Date | null) {
    if (!lockedAt) return true;
    return Date.now() - new Date(lockedAt).getTime() > GRADING_LOCK_MINUTES * 60 * 1000;
}

export async function notifyStudentsByClassIds(
    classIds: number[],
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number }
) {
    if (!classIds.length) return;
    const students = await db
        .select({ id: student.id })
        .from(student)
        .where(and(sql`${student.classId} IN (${sql.join(classIds, sql`, `)})`, isNull(student.deletedAt)));

    if (!students.length) return;

    await db.insert(notification).values(
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
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number }
) {
    await db.insert(notification).values({
        receiverType: 4,
        receiverId: studentId,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId,
    });
}

export async function requireTeacherAuth(req: Request): Promise<{ user: AuthUser | null; error: Response | null; session?: any }> {
    const token = getCookieValue(req, TEACHER_SESSION_COOKIE) ?? req.headers.get("x-teacher-session");
    if (!token) {
        return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }

    const [session] = await db
        .select()
        .from(userSession)
        .where(and(eq(userSession.sessionToken, token), eq(userSession.userType, TEACHER_USER_TYPE)))
        .limit(1);

    if (session) {
        const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
        if (expiresAt && expiresAt <= new Date()) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
            return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        }

        const [t] = await db
            .select({ id: teacher.id, employeeId: teacher.employeeId, name: teacher.name, isFirstLogin: teacher.isFirstLogin })
            .from(teacher)
            .where(eq(teacher.id, session.userId));

        if (!t) {
            return { user: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
        }

        const now = new Date();
        const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
        const newExpiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);
        await db.update(userSession).set({ lastActiveAt: now, expiresAt: newExpiresAt }).where(eq(userSession.id, session.id));

        return {
            user: {
                id: t.id,
                type: "teacher",
                name: t.name,
                employeeId: t.employeeId,
                isFirstLogin: t.isFirstLogin,
            },
            error: null,
            session: { ...session, expiresAt: newExpiresAt },
        };
    }

    const [assistantSession] = await db
        .select()
        .from(userSession)
        .where(and(eq(userSession.sessionToken, token), eq(userSession.userType, ASSISTANT_USER_TYPE)))
        .limit(1);

    if (assistantSession) {
        const expiresAt = assistantSession.expiresAt ? new Date(assistantSession.expiresAt) : null;
        if (expiresAt && expiresAt <= new Date()) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
            return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        }

        const [a] = await db
            .select({ id: assistant.id, account: assistant.account, name: assistant.name, isFirstLogin: assistant.isFirstLogin, creatorTeacherId: assistant.creatorTeacherId })
            .from(assistant)
            .where(eq(assistant.id, assistantSession.userId));

        if (!a) {
            return { user: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
        }

        const now = new Date();
        const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
        const newExpiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);
        await db.update(userSession).set({ lastActiveAt: now, expiresAt: newExpiresAt }).where(eq(userSession.id, assistantSession.id));

        return {
            user: {
                id: a.id,
                type: "assistant",
                name: a.name,
                account: a.account,
                isFirstLogin: a.isFirstLogin,
                creatorTeacherId: a.creatorTeacherId,
            },
            error: null,
            session: { ...assistantSession, expiresAt: newExpiresAt },
        };
    }

    return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
}

export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
    const auth = await requireTeacherAuth(req);
    return auth.user;
}

export async function getCurrentTeacherId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    if (user?.type === "teacher") return user.id;
    if (user?.type === "assistant") return user.creatorTeacherId ?? null;
    return null;
}

export async function requirePrimaryTeacher(req: Request): Promise<{ teacherId: number | null; error: Response | null }> {
    const auth = await requireTeacherAuth(req);
    if (auth.error) {
        return { teacherId: null, error: auth.error };
    }

    if (auth.user?.type !== "teacher") {
        return { teacherId: null, error: error("仅教师可执行此操作", "FORBIDDEN", 403) };
    }

    return { teacherId: auth.user.id, error: null };
}

export async function getCurrentAssistantId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    return user?.type === "assistant" ? user.id : null;
}

export function withTeacherAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: routes.GET
            ? async (req) => {
                const auth = await requireTeacherAuth(req);
                if (auth.error) return auth.error;
                return routes.GET!(req);
            }
            : undefined,
        POST: routes.POST
            ? async (req) => {
                const auth = await requireTeacherAuth(req);
                if (auth.error) return auth.error;
                return routes.POST!(req);
            }
            : undefined,
        PUT: routes.PUT
            ? async (req) => {
                const auth = await requireTeacherAuth(req);
                if (auth.error) return auth.error;
                return routes.PUT!(req);
            }
            : undefined,
        DELETE: routes.DELETE
            ? async (req) => {
                const auth = await requireTeacherAuth(req);
                if (auth.error) return auth.error;
                return routes.DELETE!(req);
            }
            : undefined,
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

    if (t.status !== undefined && t.status !== null && t.status !== 1) {
        return error("账号已停用，请联系管理员", "ACCOUNT_DISABLED", 403);
    }

    const isValid = await Bun.password.verify(password, t.password);
    if (!isValid) {
        const failCount = (t.loginFailCount ?? 0) + 1;
        const updateData: any = { loginFailCount: failCount };
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

    const token = crypto.randomUUID();
    const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    await db.delete(userSession).where(and(eq(userSession.userType, TEACHER_USER_TYPE), eq(userSession.userId, t.id)));

    await db.insert(userSession).values({
        sessionToken: token,
        userType: TEACHER_USER_TYPE,
        userId: t.id,
        deviceInfo: req.headers.get("user-agent") ?? "",
        expiresAt,
        lastActiveAt: now,
    });

    await db.insert(loginLog).values({
        userType: TEACHER_USER_TYPE,
        userId: t.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent") ?? "",
    });

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
        const updateData: any = { loginFailCount: failCount };
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

    const token = crypto.randomUUID();
    const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    await db.delete(userSession).where(and(eq(userSession.userType, ASSISTANT_USER_TYPE), eq(userSession.userId, a.id)));

    await db.insert(userSession).values({
        sessionToken: token,
        userType: ASSISTANT_USER_TYPE,
        userId: a.id,
        deviceInfo: req.headers.get("user-agent") ?? "",
        expiresAt,
        lastActiveAt: now,
    });

    await db.insert(loginLog).values({
        userType: ASSISTANT_USER_TYPE,
        userId: a.id,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent") ?? "",
    });

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

        return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
    },
};

const teacherMeRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        return json({ ...auth.user!, sessionExpiresAt: auth.session?.expiresAt ?? null });
    },
};

const teacherLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = getCookieValue(req, TEACHER_SESSION_COOKIE) ?? req.headers.get("x-teacher-session");
        if (token) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(TEACHER_SESSION_COOKIE, secure) });
    },
};

const teacherPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        if (newPassword === currentPassword) {
            return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);
        }

        const user = auth.user!;
        const accountId = user.type === "teacher" ? user.employeeId : user.account;
        const policy = validateTeacherPassword(newPassword, accountId ?? "");
        if (!policy.isValid) {
            return error("新密码需至少8位且包含字母、数字、特殊字符，且不包含工号", "VALIDATION_ERROR", 400);
        }

        if (user.type === "teacher") {
            const [t] = await db.select().from(teacher).where(eq(teacher.id, user.id));
            if (!t) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

            const isValid = await Bun.password.verify(currentPassword, t.password);
            if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

            const hashed = await Bun.password.hash(newPassword);
            await db.update(teacher).set({ password: hashed, isFirstLogin: 0 }).where(eq(teacher.id, t.id));
        } else {
            const [a] = await db.select().from(assistant).where(eq(assistant.id, user.id));
            if (!a) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

            const isValid = await Bun.password.verify(currentPassword, a.password);
            if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

            const hashed = await Bun.password.hash(newPassword);
            await db.update(assistant).set({ password: hashed, isFirstLogin: 0 }).where(eq(assistant.id, a.id));
        }

        return json({ success: true });
    },
};

export { teacherLoginRoutes, teacherLogoutRoutes, teacherMeRoutes, teacherPasswordRoutes };
