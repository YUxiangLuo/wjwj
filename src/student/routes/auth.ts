import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { class_, student } from "../../db/schema";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "../../lib/password-policy";
import { buildSessionCookie, error, isSecureRequest, json, parseBody, stringValue } from "../../server/http";
import { hashPassword, verifyPassword } from "../../server/password-work";
import type { RouteDefinition } from "../../server/route-types";
import {
    createUserSession,
    logoutUserSession,
    sessionChangedError,
    loadActiveUserSession,
    rotateUserSession,
} from "../../server/user-session";

export const STUDENT_USER_TYPE = 3;
export const STUDENT_SESSION_COOKIE = "student_session";

const STUDENT_AUTH_CACHE = Symbol("student_auth");

export interface CurrentStudent {
    id: number;
    studentId: string;
    name: string;
    classId: number;
}

type StudentAuthResult = { student: CurrentStudent | null; error: Response | null };
type StudentRequestContext = Request & { [STUDENT_AUTH_CACHE]?: StudentAuthResult };

export async function getCurrentStudent(req: Request): Promise<StudentAuthResult> {
    const cached = (req as StudentRequestContext)[STUDENT_AUTH_CACHE];
    if (cached) return cached;

    const currentSession = await loadActiveUserSession(req, STUDENT_SESSION_COOKIE, [STUDENT_USER_TYPE]);
    if (!currentSession.session) {
        const result = { student: null, error: currentSession.failure === "identity_changed" ? sessionChangedError() : error("未登录或登录已过期", "UNAUTHORIZED", 401) };
        (req as StudentRequestContext)[STUDENT_AUTH_CACHE] = result;
        return result;
    }

    const [row] = await db
        .select({
            id: student.id,
            studentId: student.studentId,
            name: student.name,
            classId: student.classId,
        })
        .from(student)
        .where(eq(student.id, currentSession.session.userId));

    const result: StudentAuthResult = row
        ? { student: row, error: null }
        : { student: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
    (req as StudentRequestContext)[STUDENT_AUTH_CACHE] = result;
    return result;
}

export async function requireAuth(req: Request) {
    return getCurrentStudent(req);
}

const loginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ studentId?: string; password?: string }>(req);
        const studentId = stringValue(body.studentId).trim();
        const password = stringValue(body.password);
        if (!studentId || !password) return error("请输入学号和密码", "VALIDATION_ERROR", 400);
        const [row] = await db.select().from(student).where(eq(student.studentId, studentId));
        if (!row) {
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }
        if (!(await verifyPassword(password, row.password))) {
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const session = await db.transaction(async (tx) => {
            // Serialize issuance with reset/delete and recheck the verified hash.
            const [active] = await tx.select({ id: student.id }).from(student)
                .where(and(eq(student.id, row.id), eq(student.password, row.password))).for("update");
            return active ? createUserSession(STUDENT_USER_TYPE, row.id, tx) : null;
        });
        if (!session) return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json(
            {
                user: {
                    id: row.id,
                    studentId: row.studentId,
                    name: row.name,
                    classId: row.classId,
                },
            },
            200,
            { "Set-Cookie": buildSessionCookie(STUDENT_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)) },
        );
    },
};

const logoutRoutes: RouteDefinition = {
    async POST(req) {
        return logoutUserSession(req, STUDENT_SESSION_COOKIE, STUDENT_USER_TYPE);
    },
};

const passwordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;

        const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
        const currentPassword = stringValue(body.currentPassword);
        const newPassword = stringValue(body.newPassword);
        if (!currentPassword || !newPassword) return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        if (currentPassword === newPassword) return error("新密码不能与当前密码相同", "PASSWORD_SAME", 400);

        const [row] = await db.select().from(student).where(eq(student.id, auth.student.id));
        if (!row) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        if (!(await verifyPassword(currentPassword, row.password))) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = evaluatePasswordRules({
            password: newPassword,
            minLength: STUDENT_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [row.studentId],
        });
        if (!policy.isPolicyValid) return error(STUDENT_PASSWORD_POLICY.errorMessage, "PASSWORD_WEAK", 400);

        const passwordHash = await hashPassword(newPassword);
        const session = await db.transaction(async (tx) => {
            const changed = await tx.update(student)
                .set({ password: passwordHash, updatedAt: new Date() })
                .where(and(eq(student.id, row.id), eq(student.password, row.password)))
                .returning({ id: student.id });
            return changed.length ? rotateUserSession(STUDENT_USER_TYPE, row.id, tx) : null;
        });
        if (!session) return error("账户状态已变化，请重新登录", "INVALID_CREDENTIALS", 401);
        const { token, expiresAt } = session;
        return json({ success: true }, 200, {
            "Set-Cookie": buildSessionCookie(STUDENT_SESSION_COOKIE, token, expiresAt, isSecureRequest(req)),
        });
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
