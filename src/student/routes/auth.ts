import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { class_, student } from "../../db/schema";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { buildSessionCookie, clearSessionCookie, error, isSecureRequest, json, parseBody } from "../../server/http";
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
}

type StudentAuthResult = { student: CurrentStudent | null; error: Response | null };
type StudentRequestContext = Request & { [STUDENT_AUTH_CACHE]?: StudentAuthResult };

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

export async function requireAuth(req: Request) {
    return getCurrentStudent(req);
}

const loginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ studentId?: string; password?: string }>(req);
        const studentId = body.studentId?.trim() ?? "";
        const password = body.password ?? "";
        if (!studentId || !password) return error("请输入学号和密码", "VALIDATION_ERROR", 400);

        const [row] = await db.select().from(student).where(eq(student.studentId, studentId));
        const valid = row
            ? await Bun.password.verify(password, row.password)
            : await Bun.password.verify(password, DUMMY_PASSWORD_HASH).then(() => false).catch(() => false);
        if (!row || !valid || row.status !== 1 || row.deletedAt) {
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const { token, expiresAt } = await createUserSession(STUDENT_USER_TYPE, row.id);
        return json(
            { user: { id: row.id, studentId: row.studentId, name: row.name, classId: row.classId } },
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
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;

        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";
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
            .set({ password: await Bun.password.hash(newPassword), updatedAt: new Date() })
            .where(eq(student.id, row.id));
        await clearOtherUserSessionsForUser(STUDENT_USER_TYPE, row.id, currentToken);
        return json({ success: true });
    },
};

const meRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const [classInfo] = await db
            .select({ className: class_.name })
            .from(class_)
            .where(eq(class_.id, auth.student.classId));
        return json({ ...auth.student, className: classInfo?.className ?? null });
    },
};

export { loginRoutes, logoutRoutes, meRoutes, passwordRoutes };
