import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { class_, student } from "../../db/schema";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { DEV_AUTH_MODE } from "../../lib/dev-mode";
import { buildSessionCookie, clearSessionCookie, error, isSecureRequest, json, parseBody, stringValue } from "../../server/http";
import { failedLoginMessage, isLoginLocked, nextFailedLoginState } from "../../server/login-lockout";
import type { RouteDefinition } from "../../server/route-types";
import {
    clearOtherUserSessionsForUser,
    createUserSession,
    deleteUserSessionByToken,
    loadActiveUserSession,
    readSessionToken,
} from "../../server/user-session";

export const STUDENT_USER_TYPE = 3;
export const STUDENT_SESSION_COOKIE = "student_session";

const STUDENT_AUTH_CACHE = Symbol("student_auth");
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$w/hP7Qg4tzkpJ83osQKCIhfaHH+AXgyU4icxg2s1sPE$PhYwmBc6O4HkfHsMpS1CoAMXJAGNfXo/vlEUxw0c+zU";

export interface CurrentStudent {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    status: number;
    isFirstLogin: number;
}

type StudentAuthResult = { student: CurrentStudent | null; error: Response | null };
type StudentRequestContext = Request & { [STUDENT_AUTH_CACHE]?: StudentAuthResult };

export interface StudentAuthOptions {
    allowFirstLogin?: boolean;
}

function applyStudentPasswordGate(result: StudentAuthResult, options: StudentAuthOptions): StudentAuthResult {
    if (!DEV_AUTH_MODE && result.student?.isFirstLogin === 1 && !options.allowFirstLogin) {
        return {
            student: null,
            error: error("首次登录或密码已重置，请先修改密码", "PASSWORD_CHANGE_REQUIRED", 403),
        };
    }
    return result;
}

export async function getCurrentStudent(req: Request): Promise<StudentAuthResult> {
    const cached = (req as StudentRequestContext)[STUDENT_AUTH_CACHE];
    if (cached) return cached;

    const currentSession = await loadActiveUserSession(req, STUDENT_SESSION_COOKIE, [STUDENT_USER_TYPE]);
    if (!currentSession.session) {
        const result = { student: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as StudentRequestContext)[STUDENT_AUTH_CACHE] = result;
        return result;
    }

    const [row] = await db
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

    const result: StudentAuthResult = !row
        ? { student: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) }
        : row.status !== 1
          ? { student: null, error: error("账号已被禁用", "ACCOUNT_DISABLED", 403) }
          : { student: row, error: null };
    (req as StudentRequestContext)[STUDENT_AUTH_CACHE] = result;
    return result;
}

export async function requireAuth(req: Request, options: StudentAuthOptions = {}) {
    return applyStudentPasswordGate(await getCurrentStudent(req), options);
}

const loginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ studentId?: string; password?: string }>(req);
        const studentId = stringValue(body.studentId).trim();
        const password = stringValue(body.password);
        if (!studentId || !password) return error("请输入学号和密码", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(student).where(eq(student.studentId, studentId));
        if (row?.status === 1 && !row.deletedAt && isLoginLocked(row)) {
            return error("登录失败次数过多，账号暂时锁定，请稍后重试", "ACCOUNT_LOCKED", 423);
        }
        const valid = row
            ? await Bun.password.verify(password, row.password)
            : await Bun.password.verify(password, DUMMY_PASSWORD_HASH).then(() => false).catch(() => false);
        if (!row || row.status !== 1 || row.deletedAt) {
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }
        if (!valid) {
            const failure = nextFailedLoginState(row);
            await db.update(student).set({ loginFailCount: failure.loginFailCount, lockedUntil: failure.lockedUntil }).where(eq(student.id, row.id));
            return error(failedLoginMessage(failure), "INVALID_CREDENTIALS", 401);
        }

        await db.update(student).set({ loginFailCount: 0, lockedUntil: null }).where(eq(student.id, row.id));

        const { token, expiresAt } = await createUserSession(STUDENT_USER_TYPE, row.id);
        return json(
            {
                user: {
                    id: row.id,
                    studentId: row.studentId,
                    name: row.name,
                    classId: row.classId,
                    isFirstLogin: row.isFirstLogin,
                },
            },
            200,
            { "Set-Cookie": buildSessionCookie(STUDENT_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)) },
        );
    },
};

const logoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = readSessionToken(req, STUDENT_SESSION_COOKIE);
        if (token) await deleteUserSessionByToken(token);
        return json(
            { ok: true },
            200,
            { "Set-Cookie": clearSessionCookie(STUDENT_SESSION_COOKIE, isSecureRequest(req)) },
        );
    },
};

const passwordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req, { allowFirstLogin: true });
        if (auth.error || !auth.student) return auth.error!;

        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = stringValue(body.currentPassword);
        const newPassword = stringValue(body.newPassword);
        if (!currentPassword || !newPassword) return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        if (currentPassword === newPassword) return error("新密码不能与当前密码相同", "PASSWORD_SAME", 400);

        const [row] = await db.select().from(student).where(eq(student.id, auth.student.id));
        if (!row) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        if (!(await Bun.password.verify(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: STUDENT_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [row.studentId],
        });
        if (!policy.isPolicyValid) return error(STUDENT_PASSWORD_POLICY.errorMessage, "PASSWORD_WEAK", 400);

        const currentToken = readSessionToken(req, STUDENT_SESSION_COOKIE);
        if (!currentToken) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        await db
            .update(student)
            .set({ password: await Bun.password.hash(newPassword), isFirstLogin: 0, loginFailCount: 0, lockedUntil: null, updatedAt: new Date() })
            .where(eq(student.id, row.id));
        await clearOtherUserSessionsForUser(STUDENT_USER_TYPE, row.id, currentToken);
        return json({ success: true });
    },
};

const meRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req, { allowFirstLogin: true });
        if (auth.error || !auth.student) return auth.error!;
        const [classInfo] = await db
            .select({ className: class_.name })
            .from(class_)
            .where(eq(class_.id, auth.student.classId));
        return json({ ...auth.student, className: classInfo?.className ?? null });
    },
};

export { loginRoutes, logoutRoutes, meRoutes, passwordRoutes };
