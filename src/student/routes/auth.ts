import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { class_, student } from "../../db/schema";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
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
import { formatLockoutRetryDuration } from "../../server/lockout-format";
import type { RouteDefinition } from "../../server/route-types";

const STUDENT_USER_TYPE = 4;
const STUDENT_SESSION_COOKIE = "student_session";
const STUDENT_SESSION_TTL_MINUTES = 240;
const STUDENT_MAX_LOGIN_ATTEMPTS = 5;
const STUDENT_LOCK_MINUTES = 30;

export async function getCurrentStudent(req: Request) {
    const currentSession = await loadActiveUserSession(
        req,
        { cookieName: STUDENT_SESSION_COOKIE, headerName: "x-student-session" },
        [STUDENT_USER_TYPE]
    );
    if (!currentSession.session) {
        if (currentSession.failure === "missing_session") {
            return { student: null, errorCode: "AUTH_005", errorMessage: "您的账号已在其他设备登录" };
        }
        return { student: null, errorCode: "AUTH_004", errorMessage: "会话已过期，请重新登录" };
    }

    const { expiresAt: newExpiresAt } = await extendUserSession(
        currentSession.session.id,
        "session.student_timeout_minutes",
        STUDENT_SESSION_TTL_MINUTES
    );

    const [s] = await db
        .select({
            id: student.id,
            studentId: student.studentId,
            name: student.name,
            classId: student.classId,
            status: student.status,
            isFirstLogin: student.isFirstLogin,
        })
        .from(student)
        .where(and(eq(student.id, currentSession.session.userId), isNull(student.deletedAt)));

    if (s) return { student: s, sessionExpiresAt: newExpiresAt };
    return { student: null, errorCode: "AUTH_004", errorMessage: "会话已过期，请重新登录" };
}

export async function requireAuth(req: Request) {
    const current = await getCurrentStudent(req);
    if (!current.student) {
        return {
            student: null,
            error: error(current.errorMessage ?? "未登录或登录已过期", current.errorCode ?? "UNAUTHORIZED", 401),
        };
    }
    if (current.student.status !== 1) {
        return { student: null, error: error("账号已被禁用", "ACCOUNT_DISABLED", 403) };
    }
    return { student: current.student, error: null, sessionExpiresAt: current.sessionExpiresAt ?? null };
}

const loginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ studentId: string; password: string }>(req);
        const studentId = body.studentId?.trim();
        const password = body.password ?? "";

        if (!studentId || !password) {
            return error("请输入学号和密码", "VALIDATION_ERROR", 400);
        }

        const [s] = await db.select().from(student).where(eq(student.studentId, studentId));
        if (!s) {
            // Perform a dummy hash verification to prevent timing-based user enumeration
            await Bun.password.verify(password, "$argon2id$v=19$m=65536,t=2,p=1$w/hP7Qg4tzkpJ83osQKCIhfaHH+AXgyU4icxg2s1sPE$PhYwmBc6O4HkfHsMpS1CoAMXJAGNfXo/vlEUxw0c+zU").catch(() => {});
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const now = new Date();
        const maxAttempts = await getConfigNumber("login.max_fail_count", STUDENT_MAX_LOGIN_ATTEMPTS);
        const lockMinutes = await getConfigNumber("login.lock_duration_minutes", STUDENT_LOCK_MINUTES);
        if (s.lockedUntil && new Date(s.lockedUntil) > now) {
            const remainingMs = new Date(s.lockedUntil).getTime() - now.getTime();
            const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
            return error(`账号已被锁定，请在${formatLockoutRetryDuration(remainingMinutes)}后重试`, "ACCOUNT_LOCKED", 403);
        }

        const isValid = await Bun.password.verify(password, s.password);
        if (!isValid) {
            const failCount = (s.loginFailCount ?? 0) + 1;
            const updateData: Record<string, unknown> = { loginFailCount: failCount };
            if (failCount >= maxAttempts) {
                updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
            }
            await db.update(student).set(updateData).where(eq(student.id, s.id));
            const remainingAttempts = Math.max(0, maxAttempts - failCount);
            return error(
                failCount >= maxAttempts
                    ? `账号或密码错误，已锁定${lockMinutes}分钟`
                    : `账号或密码错误，还剩${remainingAttempts}次尝试机会`,
                "INVALID_CREDENTIALS",
                401
            );
        }

        if (s.status !== 1) {
            return error("账号已被停用，请联系教师", "ACCOUNT_DISABLED", 403);
        }

        await db.update(student).set({ loginFailCount: 0, lockedUntil: null }).where(eq(student.id, s.id));

        const { token, expiresAt } = await createSingleUserSession({
            req,
            userType: STUDENT_USER_TYPE,
            userId: s.id,
            ttlConfigKey: "session.student_timeout_minutes",
            defaultTtlMinutes: STUDENT_SESSION_TTL_MINUTES,
        });

        await recordLoginLog(req, STUDENT_USER_TYPE, s.id);

        const secure = isSecureRequest(req);
        return json(
            {
                user: { id: s.id, studentId: s.studentId, name: s.name, classId: s.classId, isFirstLogin: s.isFirstLogin },
                expiresAt,
            },
            200,
            { "Set-Cookie": buildSessionCookie(STUDENT_SESSION_COOKIE, token, expiresAt, secure) }
        );
    },
};

const logoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = readSessionToken(req, {
            cookieName: STUDENT_SESSION_COOKIE,
            headerName: "x-student-session",
        });
        if (token) {
            await deleteUserSessionByToken(token);
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(STUDENT_SESSION_COOKIE, secure) });
    },
};

const passwordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        const [s] = await db.select().from(student).where(eq(student.id, auth.student!.id));
        if (!s) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

        const isValid = await Bun.password.verify(currentPassword, s.password);
        if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

        if (currentPassword === newPassword) {
            return error("新密码不能与当前密码相同", "PASSWORD_SAME", 400);
        }

        const rules = evaluatePasswordRules({
            password: newPassword,
            minLength: STUDENT_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [s.studentId],
        });
        if (!rules.isPolicyValid) {
            return error(STUDENT_PASSWORD_POLICY.errorMessage, "PASSWORD_WEAK", 400);
        }

        const hashed = await Bun.password.hash(newPassword);
        await db.update(student).set({ password: hashed, isFirstLogin: 0 }).where(eq(student.id, s.id));

        // Invalidate other sessions but keep the current one (spec: "不强制重新登录")
        const currentToken = readSessionToken(req, {
            cookieName: STUDENT_SESSION_COOKIE,
            headerName: "x-student-session",
        });
        await clearUserSessionForUser(STUDENT_USER_TYPE, s.id, currentToken);

        return json({ success: true });
    },
};

const meRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const [classInfo] = await db.select({ className: class_.name }).from(class_).where(eq(class_.id, currentStudent.classId));

        return json({
            id: currentStudent.id,
            studentId: currentStudent.studentId,
            name: currentStudent.name,
            classId: currentStudent.classId,
            className: classInfo?.className ?? null,
            isFirstLogin: currentStudent.isFirstLogin ?? 0,
            sessionExpiresAt: auth.sessionExpiresAt?.toISOString() ?? null,
        });
    },
};

const sessionRoutes: RouteDefinition = {
    async GET(req) {
        const current = await getCurrentStudent(req);
        if (!current.student) {
            return error(current.errorMessage ?? "未登录或登录已过期", current.errorCode ?? "UNAUTHORIZED", 401);
        }

        return json({
            expiresAt: current.sessionExpiresAt?.toISOString() ?? null,
        });
    },
};

export { loginRoutes, logoutRoutes, meRoutes, passwordRoutes, sessionRoutes };
