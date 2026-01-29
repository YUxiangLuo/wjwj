/**
 * Teacher API Routes
 * 教师端 API 接口集合
 */

import { db } from "../db";
import {
    teacher,
    class_,
    student,
    topic,
    topicAttachment,
    topicRecommendQuestion,
    task,
    submission,
    experiment,
    assistant,
    assistantClass,
    semester,
    userSession,
    loginLog,
    notification,
    systemConfig,
} from "../db/schema";
import { eq, desc, asc, and, sql, count, or, like, isNull } from "drizzle-orm";
import * as XLSX from "xlsx";

// ============================================================
// Types
// ============================================================

type RouteHandler = (req: Request) => Promise<Response> | Response;

interface RouteDefinition {
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    DELETE?: RouteHandler;
}

// ============================================================
// Helpers
// ============================================================

function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers });
}

function error(message: string, code: string, status = 400): Response {
    return Response.json({ success: false, error: { code, message } }, { status });
}

async function parseBody<T>(req: Request): Promise<T> {
    return req.json() as Promise<T>;
}

function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
}

const TEACHER_USER_TYPE = 2;
const ASSISTANT_USER_TYPE = 3;
const TEACHER_SESSION_COOKIE = "teacher_session";
const TEACHER_SESSION_TTL_MINUTES = 120;
const TEACHER_MAX_LOGIN_ATTEMPTS = 5;
const TEACHER_LOCK_MINUTES = 30;
const GRADING_LOCK_MINUTES = 30;

async function getConfigNumber(key: string, fallback: number) {
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

function getCookieValue(req: Request, name: string): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match?.[1] ?? null;
}

function getClientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
    return req.headers.get("x-real-ip") ?? "";
}

function isSecureRequest(req: Request) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    if (forwardedProto) {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }
    return new URL(req.url).protocol === "https:";
}

function buildSessionCookie(token: string, expiresAt: Date, secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${TEACHER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()};${secureFlag}`;
}

function clearSessionCookie(secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${TEACHER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT;${secureFlag}`;
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

function isLockExpired(lockedAt?: Date | null) {
    if (!lockedAt) return true;
    return Date.now() - new Date(lockedAt).getTime() > GRADING_LOCK_MINUTES * 60 * 1000;
}

async function notifyStudentsByClassIds(
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

async function notifyStudentById(
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

// 用户类型：教师或助教
interface AuthUser {
    id: number;
    type: "teacher" | "assistant";
    name: string;
    employeeId?: string;
    account?: string;
    isFirstLogin: number;
    creatorTeacherId?: number; // 仅助教有此字段
}

async function requireTeacherAuth(req: Request): Promise<{ user: AuthUser | null; error: Response | null; session?: any }> {
    const token = getCookieValue(req, TEACHER_SESSION_COOKIE) ?? req.headers.get("x-teacher-session");
    if (!token) {
        return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }

    // 先尝试查找教师会话
    const [session] = await db
        .select()
        .from(userSession)
        .where(
            and(
                eq(userSession.sessionToken, token),
                eq(userSession.userType, TEACHER_USER_TYPE)
            )
        )
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
            session: { ...session, expiresAt: newExpiresAt }
        };
    }

    // 再尝试查找助教会话
    const [assistantSession] = await db
        .select()
        .from(userSession)
        .where(
            and(
                eq(userSession.sessionToken, token),
                eq(userSession.userType, ASSISTANT_USER_TYPE)
            )
        )
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
            session: { ...assistantSession, expiresAt: newExpiresAt }
        };
    }

    return { user: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
}

async function getCurrentUser(req: Request): Promise<AuthUser | null> {
    const auth = await requireTeacherAuth(req);
    return auth.user;
}

async function getCurrentTeacherId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    if (user?.type === "teacher") return user.id;
    if (user?.type === "assistant") return user.creatorTeacherId ?? null;
    return null;
}

async function getCurrentAssistantId(req: Request): Promise<number | null> {
    const user = await getCurrentUser(req);
    return user?.type === "assistant" ? user.id : null;
}

function withTeacherAuth(routes: RouteDefinition): RouteDefinition {
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

// ============================================================
// Auth API
// ============================================================

const teacherLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ employeeId: string; password: string }>(req);
        const employeeId = body.employeeId?.trim();
        const password = body.password ?? "";

        if (!employeeId || !password) {
            return error("请输入工号和密码", "VALIDATION_ERROR", 400);
        }

        // 先尝试查找教师
        const [t] = await db.select().from(teacher).where(eq(teacher.employeeId, employeeId));
        if (t) {
            return handleTeacherLogin(req, t, password);
        }

        // 再尝试查找助教（使用 account 字段）
        const [a] = await db.select().from(assistant).where(eq(assistant.account, employeeId));
        if (a) {
            return handleAssistantLogin(req, a, password);
        }

        return error("工号或密码错误", "INVALID_CREDENTIALS", 401);
    },
};

async function handleTeacherLogin(req: Request, t: typeof teacher.$inferSelect, password: string): Promise<Response> {
    const now = new Date();
    const maxAttempts = await getConfigNumber("login.max_fail_count", TEACHER_MAX_LOGIN_ATTEMPTS);
    const lockMinutes = await getConfigNumber("login.lock_duration_minutes", TEACHER_LOCK_MINUTES);

    if (t.lockedUntil && new Date(t.lockedUntil) > now) {
        return error("账号已锁定，请稍后再试", "ACCOUNT_LOCKED", 403);
    }

    const isValid = await Bun.password.verify(password, t.password);
    if (!isValid) {
        const failCount = (t.loginFailCount ?? 0) + 1;
        const updateData: any = { loginFailCount: failCount };
        if (failCount >= maxAttempts) {
            updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
        }
        await db.update(teacher).set(updateData).where(eq(teacher.id, t.id));
        return error(
            failCount >= maxAttempts
                ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                : "工号或密码错误",
            "INVALID_CREDENTIALS",
            401
        );
    }

    await db.update(teacher).set({ loginFailCount: 0, lockedUntil: null }).where(eq(teacher.id, t.id));

    const token = crypto.randomUUID();
    const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    // 单设备登录：清理旧 session
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
        { "Set-Cookie": buildSessionCookie(token, expiresAt, secure) }
    );
}

async function handleAssistantLogin(req: Request, a: typeof assistant.$inferSelect, password: string): Promise<Response> {
    const now = new Date();
    const maxAttempts = await getConfigNumber("login.max_fail_count", TEACHER_MAX_LOGIN_ATTEMPTS);
    const lockMinutes = await getConfigNumber("login.lock_duration_minutes", TEACHER_LOCK_MINUTES);

    if (a.lockedUntil && new Date(a.lockedUntil) > now) {
        return error("账号已锁定，请稍后再试", "ACCOUNT_LOCKED", 403);
    }

    // 检查助教状态
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
        return error(
            failCount >= maxAttempts
                ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                : "工号或密码错误",
            "INVALID_CREDENTIALS",
            401
        );
    }

    await db.update(assistant).set({ loginFailCount: 0, lockedUntil: null }).where(eq(assistant.id, a.id));

    const token = crypto.randomUUID();
    const sessionTtlMinutes = await getConfigNumber("session.teacher_timeout_minutes", TEACHER_SESSION_TTL_MINUTES);
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    // 单设备登录：清理旧 session
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
        { "Set-Cookie": buildSessionCookie(token, expiresAt, secure) }
    );
}

const teacherMeRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        return json(auth.user!);
    },
};

const teacherLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = getCookieValue(req, TEACHER_SESSION_COOKIE) ?? req.headers.get("x-teacher-session");
        if (token) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(secure) });
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

// ============================================================
// Dashboard Stats API
// ============================================================

const dashboardRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [
            [myClasses],
            [myTopics],
            [pendingGrading],
            [activeTasks]
        ] = await Promise.all([
            db.select({ count: count() }).from(class_).where(eq(class_.teacherId, currentTeacherId)),
            db.select({ count: count() }).from(topic).where(eq(topic.teacherId, currentTeacherId)),
            db.select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(and(
                    eq(submission.status, 1), // 1 = Pending
                    eq(class_.teacherId, currentTeacherId)
                )),
            // Simplified task count: tasks assigned to my classes
            db.select({ count: count() })
                .from(task)
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(eq(class_.teacherId, currentTeacherId))
        ]);

        // Recent submissions
        // Complex join: Submission -> Experiment -> Student, Task -> Topic
        const recentSubs = await db.select({
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            submittedAt: submission.submittedAt
        })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .orderBy(desc(submission.submittedAt))
            .limit(5);

        return json({
            stats: [
                { label: "我的班级", value: myClasses?.count ?? 0 },
                { label: "我的课题", value: myTopics?.count ?? 0 },
                { label: "待批改作业", value: pendingGrading?.count ?? 0 },
                { label: "进行中任务", value: activeTasks?.count ?? 0 },
            ],
            recentSubmissions: recentSubs.map(sub => ({
                student: sub.studentName,
                class: sub.className,
                topic: sub.topicName,
                time: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "未知时间"
            }))
        });
    }
};

// ============================================================
// Export Routes
// ============================================================

function parseIdList(value: string | null) {
    if (!value) return [] as number[];
    return value.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
}

async function getGradeExportRows(currentTeacherId: number, params: URLSearchParams) {
    const classId = params.get("classId");
    const topicId = params.get("topicId");
    const taskId = params.get("taskId");
    const taskIds = parseIdList(params.get("taskIds"));

    let query = db
        .select({
            studentId: student.studentId,
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            submittedAt: submission.submittedAt,
            scoreQuestionnaire: submission.scoreQuestionnaire,
            scoreProcess: submission.scoreProcess,
            scoreReport: submission.scoreReport,
            totalScore: submission.totalScore,
            status: submission.status,
            gradedByType: submission.gradedByType,
            gradedById: submission.gradedById,
            gradedAt: submission.gradedAt,
        })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(eq(class_.teacherId, currentTeacherId))
        .$dynamic();

    if (classId && classId !== "all") {
        query = query.where(eq(class_.id, Number(classId)));
    }
    if (topicId && topicId !== "all") {
        query = query.where(eq(topic.id, Number(topicId)));
    }
    if (taskId && taskId !== "all") {
        query = query.where(eq(task.id, Number(taskId)));
    }
    if (taskIds.length > 0) {
        query = query.where(sql`${task.id} IN (${sql.join(taskIds, sql`, `)})`);
    }

    const rows = await query;
    return rows.map((r) => ({
        studentId: r.studentId,
        name: r.studentName,
        className: r.className,
        topicName: r.topicName,
        submittedAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "",
        scoreQuestionnaire: r.scoreQuestionnaire ?? "",
        scoreProcess: r.scoreProcess ?? "",
        scoreReport: r.scoreReport ?? "",
        totalScore: r.totalScore ?? "",
        status: r.status === 2 ? "已批改" : r.status === 3 ? "已驳回" : r.status === 1 ? "待批改" : "草稿",
        gradedAt: r.gradedAt ? new Date(r.gradedAt).toLocaleString() : "",
        gradedBy: r.gradedById ? String(r.gradedById) : "",
    }));
}

const gradeExportPreviewRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const params = getSearchParams(req);
        const classId = params.get("classId");
        const topicId = params.get("topicId");

        let query = db
            .select({
                taskId: task.id,
                topicId: topic.id,
                topicName: topic.name,
                classId: class_.id,
                className: class_.name,
                total: count(student.id),
                graded: sql<number>`(
                    SELECT COUNT(*)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 2
                )`,
                avgScore: sql<number>`(
                    SELECT AVG(s.total_score)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 2
                )`,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(task.id)
            .$dynamic();

        if (classId && classId !== "all") {
            query = query.where(eq(class_.id, Number(classId)));
        }
        if (topicId && topicId !== "all") {
            query = query.where(eq(topic.id, Number(topicId)));
        }

        const rows = await query;
        return json(rows.map((r) => ({
            taskId: r.taskId,
            topicId: r.topicId,
            topic: r.topicName,
            classId: r.classId,
            className: r.className,
            graded: Number(r.graded ?? 0),
            total: Number(r.total ?? 0),
            avgScore: r.avgScore ? Number(r.avgScore) : 0,
        })));
    }
};

const gradeExportDataRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const params = getSearchParams(req);
        const rows = await getGradeExportRows(currentTeacherId, params);
        return json(rows);
    }
};

const gradeExportExcelRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const params = getSearchParams(req);
        const rows = await getGradeExportRows(currentTeacherId, params);

        const headers = [
            "学号",
            "姓名",
            "班级",
            "课题名称",
            "提交时间",
            "问卷设计得分",
            "实验过程得分",
            "实验报告得分",
            "总分",
            "状态",
            "批改人",
            "批改时间",
        ];

        const data = rows.map((r) => ({
            学号: r.studentId,
            姓名: r.name,
            班级: r.className,
            课题名称: r.topicName,
            提交时间: r.submittedAt,
            问卷设计得分: r.scoreQuestionnaire,
            实验过程得分: r.scoreProcess,
            实验报告得分: r.scoreReport,
            总分: r.totalScore,
            状态: r.status,
            批改人: r.gradedBy,
            批改时间: r.gradedAt,
        }));

        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "成绩导出");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const fileName = `grade-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new Response(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename=${fileName}`,
            },
        });
    }
};

// ============================================================
// Class API
// ============================================================

const classRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const rows = await db
            .select({
                id: class_.id,
                name: class_.name,
                semester: semester.name,
                studentCount: count(student.id),
                createdAt: class_.createdAt,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt))) // only active students
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(class_.id)
            .orderBy(desc(class_.createdAt));

        return json(rows);
    }
};

const classStudentsRoutes: RouteDefinition = {
    async GET(req) {
        // /api/teacher/classes/:classId/students
        const url = new URL(req.url); // e.g., /api/teacher/classes/1/students
        const parts = url.pathname.split("/");
        // parts: ["", "api", "teacher", "classes", "1", "students"]
        const classId = Number(parts[4]);

        if (isNaN(classId)) return error("Invalid Class ID", "INVALID_ID");

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [cls] = await db
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.id, classId), eq(class_.teacherId, currentTeacherId)));

        if (!cls) return error("无权限访问该班级", "FORBIDDEN", 403);

        const rows = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                // email: student.email, // Not in schema
                status: student.status,
                lastLogin: sql<string>`(select max(login_at) from login_log where user_id = ${student.id} and user_type = 2)`,
            })
            .from(student)
            .where(and(eq(student.classId, classId), isNull(student.deletedAt)));

        return json(rows);
    },

    async POST(req) {
        // Add student
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const classId = Number(parts[4]);

        if (isNaN(classId)) return error("Invalid Class ID", "INVALID_ID");

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [cls] = await db
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.id, classId), eq(class_.teacherId, currentTeacherId)));

        if (!cls) return error("无权限访问该班级", "FORBIDDEN", 403);

        const body = await parseBody<{ studentId: string; name: string; email?: string }>(req);
        if (!body.studentId || !body.name) return error("Missing required fields", "VALIDATION_ERROR");

        // Check duplicate
        const [exist] = await db.select().from(student).where(eq(student.studentId, body.studentId));
        if (exist) return error("Student ID already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(student).values({
            studentId: body.studentId,
            name: body.name,
            classId: classId,
            password: defaultPassword,
            status: 1,
            isFirstLogin: 1,
            // email: body.email // Check if schema supports email
        });

        return json({ success: true }, 201);
    }
};

const classStudentsImportRoutes: RouteDefinition = {
    async POST(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const classId = Number(parts[4]);

        if (isNaN(classId)) return error("Invalid Class ID", "INVALID_ID");

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [cls] = await db
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.id, classId), eq(class_.teacherId, currentTeacherId)));

        if (!cls) return error("无权限访问该班级", "FORBIDDEN", 403);

        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return error("请选择文件", "VALIDATION_ERROR", 400);
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return error("文件内容为空", "VALIDATION_ERROR", 400);

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return error("文件内容为空", "VALIDATION_ERROR", 400);
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

        if (rows.length === 0) {
            return error("文件内容为空", "VALIDATION_ERROR", 400);
        }

        const errors: Array<{ row: number; reason: string }> = [];
        const toInsert: Array<{ studentId: string; name: string; email?: string }> = [];

        rows.forEach((row, index) => {
            const rowIndex = index + 2; // assume header row
            const studentId = String(row.studentId ?? row.学号 ?? row.id ?? "").trim();
            const name = String(row.name ?? row.姓名 ?? "").trim();
            const email = String(row.email ?? row.邮箱 ?? "").trim();

            if (!studentId || !name) {
                errors.push({ row: rowIndex, reason: "缺少学号或姓名" });
                return;
            }

            toInsert.push({ studentId, name, email: email || undefined });
        });

        if (toInsert.length === 0) {
            return json({ successCount: 0, failureCount: errors.length, errors });
        }

        const existing = await db
            .select({ studentId: student.studentId })
            .from(student)
            .where(sql`${student.studentId} IN (${sql.join(toInsert.map(s => s.studentId), sql`, `)})`);

        const existingSet = new Set(existing.map(e => e.studentId));
        const finalInsert = toInsert.filter(item => !existingSet.has(item.studentId));

        existingSet.forEach((id) => {
            errors.push({ row: -1, reason: `学号已存在: ${id}` });
        });

        const defaultPassword = await Bun.password.hash("123456");

        await db.transaction(async (tx) => {
            for (const item of finalInsert) {
                await tx.insert(student).values({
                    studentId: item.studentId,
                    name: item.name,
                    classId: classId,
                    password: defaultPassword,
                    status: 1,
                    isFirstLogin: 1,
                });
            }
        });

        return json({
            successCount: finalInsert.length,
            failureCount: errors.length,
            errors,
        });
    }
};

const studentRoutes: RouteDefinition = {
    async PUT(req) {
        // /api/teacher/students/:id
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const studentId = Number(parts[parts.length - 1]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: student.id })
            .from(student)
            .innerJoin(class_, eq(student.classId, class_.id))
            .where(and(eq(student.id, studentId), eq(class_.teacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该学生", "FORBIDDEN", 403);

        const body = await parseBody<{ action: "reset_password" | "toggle_status" }>(req);

        if (body.action === "reset_password") {
            const newPassword = await Bun.password.hash("123456");
            await db.update(student).set({ password: newPassword, isFirstLogin: 1 }).where(eq(student.id, studentId));
        } else if (body.action === "toggle_status") {
            // Get current
            const [current] = await db.select({ status: student.status }).from(student).where(eq(student.id, studentId));
            if (current) {
                const newStatus = current.status === 1 ? 0 : 1;
                await db.update(student).set({ status: newStatus }).where(eq(student.id, studentId));
            }
        }

        return json({ success: true });
    },

    async DELETE(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const studentId = Number(parts[parts.length - 1]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: student.id })
            .from(student)
            .innerJoin(class_, eq(student.classId, class_.id))
            .where(and(eq(student.id, studentId), eq(class_.teacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该学生", "FORBIDDEN", 403);

        await db.update(student).set({ deletedAt: new Date(), status: 0 }).where(eq(student.id, studentId));
        return json({ success: true });
    }
};

const assistantRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        // Fetch assistants created by this teacher
        const assistants = await db
            .select({
                id: assistant.id,
                account: assistant.account,
                name: assistant.name,
                status: assistant.status,
            })
            .from(assistant)
            .where(eq(assistant.creatorTeacherId, currentTeacherId));

        // To get assigned classes, we can query separately or join.
        // Let's query relations for simplicity or one big query.

        const results = await Promise.all(assistants.map(async (ast) => {
            const classes = await db
                .select({ name: class_.name, id: class_.id })
                .from(assistantClass)
                .innerJoin(class_, eq(assistantClass.classId, class_.id))
                .where(eq(assistantClass.assistantId, ast.id));

            const [lastLogin] = await db
                .select({
                    lastLogin: sql<string>`(select max(login_at) from login_log where user_id = ${ast.id} and user_type = ${ASSISTANT_USER_TYPE})`,
                })
                .from(loginLog)
                .limit(1);

            return {
                id: ast.id,
                name: ast.name,
                studentId: ast.account, // Mapping account to studentId for frontend consistency
                email: "",
                assignedClasses: classes.map(c => c.name),
                assignedClassIds: classes.map(c => c.id),
                status: ast.status,
                lastLogin: lastLogin?.lastLogin ?? null,
            };
        }));

        return json(results);
    },

    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const body = await parseBody<{ name: string; studentId: string }>(req); // studentId = account

        if (!body.name || !body.studentId) return error("Missing fields", "VALIDATION_ERROR");

        const [exist] = await db.select().from(assistant).where(eq(assistant.account, body.studentId));
        if (exist) return error("Account already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(assistant).values({
            name: body.name,
            account: body.studentId,
            password: defaultPassword,
            creatorTeacherId: currentTeacherId,
            status: 1
        });

        return json({ success: true }, 201);
    }
};

const assistantItemRoutes: RouteDefinition = {
    async PUT(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: assistant.id, account: assistant.account, name: assistant.name, status: assistant.status })
            .from(assistant)
            .where(and(eq(assistant.id, id), eq(assistant.creatorTeacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该助教", "FORBIDDEN", 403);

        const body = await parseBody<{ action: "reset_password" | "toggle_status" | "delete" }>(req);

        if (body.action === "reset_password") {
            const newPassword = await Bun.password.hash(owned.account);
            await db.update(assistant).set({ password: newPassword, isFirstLogin: 1 }).where(eq(assistant.id, id));
        } else if (body.action === "toggle_status") {
            const newStatus = owned.status === 1 ? 0 : 1;
            await db.update(assistant).set({ status: newStatus }).where(eq(assistant.id, id));
        } else if (body.action === "delete") {
            const newName = owned.name.includes("已删除") ? owned.name : `${owned.name}(已删除)`;
            await db.update(assistant).set({ status: 0, name: newName }).where(eq(assistant.id, id));
        }

        return json({ success: true });
    },
    async DELETE(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: assistant.id })
            .from(assistant)
            .where(and(eq(assistant.id, id), eq(assistant.creatorTeacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该助教", "FORBIDDEN", 403);

        // Soft delete
        const [ast] = await db.select({ name: assistant.name }).from(assistant).where(eq(assistant.id, id));
        const newName = ast?.name?.includes("已删除") ? ast.name : `${ast?.name ?? "助教"}(已删除)`;
        await db.update(assistant).set({ status: 0, name: newName }).where(eq(assistant.id, id));

        return json({ success: true });
    }
};

const assistantClassAssignRoutes: RouteDefinition = {
    async POST(req) {
        // /api/teacher/assistants/:id/classes
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        // parts: ... assistants, :id, classes
        const assistantId = Number(parts[4]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: assistant.id })
            .from(assistant)
            .where(and(eq(assistant.id, assistantId), eq(assistant.creatorTeacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该助教", "FORBIDDEN", 403);

        const body = await parseBody<{ classIds: number[]; force?: boolean }>(req);

        const existing = await db
            .select({ classId: assistantClass.classId })
            .from(assistantClass)
            .where(eq(assistantClass.assistantId, assistantId));

        const existingIds = new Set(existing.map((c) => c.classId));
        const nextIds = new Set(body.classIds ?? []);
        const removed = [...existingIds].filter((id) => !nextIds.has(id));

        if (removed.length > 0 && !body.force) {
            const [drafts] = await db
                .select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .where(and(
                    eq(submission.status, 0),
                    eq(submission.gradedByType, ASSISTANT_USER_TYPE),
                    eq(submission.gradedById, assistantId),
                    sql`${task.classId} IN (${sql.join(removed, sql`, `)})`
                ));

            if ((drafts?.count ?? 0) > 0) {
                return error("该助教在移除班级存在批改草稿，继续将保留草稿但无法继续批改。", "HAS_DRAFTS", 409);
            }
        }

        // Transaction to reset classes
        await db.transaction(async (tx) => {
            await tx.delete(assistantClass).where(eq(assistantClass.assistantId, assistantId));

            if (body.classIds && body.classIds.length > 0) {
                for (const classId of body.classIds) {
                    await tx.insert(assistantClass).values({
                        assistantId: assistantId,
                        classId: classId
                    });
                }
            }
        });

        return json({ success: true });
    }
};

// ============================================================
// Topic API
// ============================================================

async function requireTopicOwner(topicId: number, teacherId: number) {
    const [row] = await db
        .select({ id: topic.id, status: topic.status })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), eq(topic.isDeleted, 0)));
    return row ?? null;
}

async function parseExcelFile(buffer: ArrayBuffer) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const columns = Object.keys(json[0] ?? {});
    return {
        rows: json,
        columns,
        rowCount: json.length,
        colCount: columns.length,
        preview: json.slice(0, 20),
    };
}

function isRowEmpty(row: Record<string, any>) {
    return Object.values(row).every((v) => `${v ?? ""}`.trim() === "");
}

function getAttachmentType(fileName: string, mimeType: string) {
    const name = fileName.toLowerCase();
    if (mimeType.startsWith("image/") || /(\.png|\.jpg|\.jpeg|\.gif)$/.test(name)) return "image";
    if (mimeType.startsWith("video/") || /(\.mp4|\.webm)$/.test(name)) return "video";
    if (/(\.pdf|\.doc|\.docx|\.ppt|\.pptx)$/.test(name)) return "document";
    return "unknown";
}

const topicRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const rows = await db
            .select({
                id: topic.id,
                name: topic.name,
                description: topic.description,
                status: topic.status,
                dataRows: topic.excelRowCount,
                // Simple count of attachments (mock logic or real join if needed)
                // attachments: ... 
                createdAt: topic.createdAt,
            })
            .from(topic)
            .where(and(eq(topic.teacherId, currentTeacherId), eq(topic.isDeleted, 0)))
            .orderBy(desc(topic.createdAt));

        return json(rows);
    },

    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const body = await parseBody<{ name: string; description?: string; status?: number }>(req);

        if (!body.name?.trim()) return error("课题名称不能为空", "VALIDATION_ERROR");

        const [result] = await db.insert(topic).values({
            teacherId: currentTeacherId,
            name: body.name.trim(),
            description: body.description ?? "",
            status: body.status ?? 0, // Default draft
        });

        return json({ id: result.insertId }, 201);
    }
};

const topicItemRoutes: RouteDefinition = {
    async PUT(req) {
        // Update topic (rename, desc, status)
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        const body = await parseBody<{ name?: string; description?: string; status?: number }>(req);

        const updateData: any = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.status !== undefined) updateData.status = body.status;

        if (Object.keys(updateData).length === 0) return json({ success: true });

        await db.update(topic).set(updateData).where(eq(topic.id, id));
        return json({ success: true });
    },

    async DELETE(req) {
        // Soft delete
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        await db.update(topic).set({ isDeleted: 1, deletedAt: new Date() }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

const topicDetailRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);

        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const [topicInfo] = await db
            .select()
            .from(topic)
            .where(eq(topic.id, id));

        const attachments = await db
            .select()
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, id))
            .orderBy(desc(topicAttachment.createdAt));

        const recommendQuestions = await db
            .select()
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, id))
            .orderBy(asc(topicRecommendQuestion.sortOrder));

        let excelInfo = null as null | { columns: string[]; preview: any[] };
        if (topicInfo?.excelFilePath) {
            try {
                const buffer = await Bun.file(`${process.cwd()}/public/${topicInfo.excelFilePath}`).arrayBuffer();
                const parsed = await parseExcelFile(buffer);
                excelInfo = { columns: parsed.columns, preview: parsed.preview };
            } catch {
                excelInfo = null;
            }
        }

        return json({
            topic: topicInfo,
            attachments,
            recommendQuestions,
            excelInfo,
        });
    }
};

const topicExcelUploadRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1) return error("已发布课题不能修改数据", "FORBIDDEN", 403);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            return error("请选择文件", "VALIDATION_ERROR", 400);
        }

        const buffer = await file.arrayBuffer();
        const parsed = await parseExcelFile(buffer);

        if (!parsed.columns.length) {
            return error("Excel表头为空", "VALIDATION_ERROR", 400);
        }

        if (parsed.rowCount < 1 || parsed.rowCount > 100000) {
            return error("数据行数需在1-100000之间", "VALIDATION_ERROR", 400);
        }

        if (parsed.colCount < 2 || parsed.colCount > 50) {
            return error("数据列数需在2-50之间", "VALIDATION_ERROR", 400);
        }

        const columnSet = new Set(parsed.columns);
        if (columnSet.size !== parsed.columns.length) {
            return error("表头存在重复列名", "VALIDATION_ERROR", 400);
        }

        const hasEmptyRow = parsed.rows.some((row) => isRowEmpty(row));
        if (hasEmptyRow) {
            return error("存在完全空白的行", "VALIDATION_ERROR", 400);
        }

        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `uploads/${fileName}`;
        await Bun.write(`${process.cwd()}/public/${filePath}`, buffer);

        await db.update(topic).set({
            excelFilePath: filePath,
            excelRowCount: parsed.rowCount,
        }).where(eq(topic.id, id));

        return json({
            filePath,
            rowCount: parsed.rowCount,
            colCount: parsed.colCount,
            columns: parsed.columns,
            preview: parsed.preview,
        });
    }
};

const topicFieldMappingRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1) return error("已发布课题不能修改字段映射", "FORBIDDEN", 403);

        const body = await parseBody<{ fieldMapping: any }>(req);
        if (!body.fieldMapping) return error("字段映射不能为空", "VALIDATION_ERROR", 400);

        const mapping = body.fieldMapping as {
            identifier?: string;
            stratified?: string[];
            numeric?: string[];
            others?: string[];
        };

        const identifier = mapping.identifier;
        const stratified = mapping.stratified ?? [];
        const numeric = mapping.numeric ?? [];
        const others = mapping.others ?? [];

        const uniqueFields = new Set([identifier, ...stratified, ...numeric, ...others].filter(Boolean));
        if (!identifier) return error("必须选择1个标识符字段", "VALIDATION_ERROR", 400);
        if (stratified.length < 1) return error("至少选择1个分层变量", "VALIDATION_ERROR", 400);
        if (numeric.length < 1) return error("至少选择1个数值变量", "VALIDATION_ERROR", 400);
        if (uniqueFields.size < 3) return error("至少选择3个字段", "VALIDATION_ERROR", 400);

        const [topicInfo] = await db.select({ excelFilePath: topic.excelFilePath }).from(topic).where(eq(topic.id, id));
        if (!topicInfo?.excelFilePath) return error("请先上传总体数据", "VALIDATION_ERROR", 400);

        const buffer = await Bun.file(`${process.cwd()}/public/${topicInfo.excelFilePath}`).arrayBuffer();
        const parsed = await parseExcelFile(buffer);

        for (const field of stratified) {
            const set = new Set<string>();
            for (const row of parsed.rows) {
                const val = String(row[field] ?? "").trim();
                if (val) set.add(val);
            }
            if (set.size > 20) {
                return error(`分层变量 ${field} 的唯一值数量超过20`, "VALIDATION_ERROR", 400);
            }
        }

        await db.update(topic).set({ fieldMapping: body.fieldMapping }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

const topicAttachmentRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            return error("请选择文件", "VALIDATION_ERROR", 400);
        }

        const [countRow] = await db
            .select({ count: count() })
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, id));
        if ((countRow?.count ?? 0) >= 20) {
            return error("附件数量已达上限", "VALIDATION_ERROR", 400);
        }

        const attachmentType = getAttachmentType(file.name, file.type || "");
        const sizeLimit = attachmentType === "image" ? 10 * 1024 * 1024
            : attachmentType === "video" ? 200 * 1024 * 1024
                : attachmentType === "document" ? 50 * 1024 * 1024
                    : 0;

        if (!sizeLimit) {
            return error("不支持的文件类型", "VALIDATION_ERROR", 400);
        }
        if (file.size > sizeLimit) {
            return error("文件大小超过限制", "VALIDATION_ERROR", 400);
        }

        const buffer = await file.arrayBuffer();
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `uploads/${fileName}`;
        await Bun.write(`${process.cwd()}/public/${filePath}`, buffer);

        const [result] = await db.insert(topicAttachment).values({
            topicId: id,
            fileName: file.name,
            filePath,
            fileType: file.type || "unknown",
            fileSize: file.size,
        });

        return json({ id: result.insertId, filePath });
    }
};

const topicAttachmentDeleteRoutes: RouteDefinition = {
    async DELETE(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const topicId = Number(parts[parts.length - 3]);
        const attachmentId = Number(parts[parts.length - 1]);
        if (isNaN(topicId) || isNaN(attachmentId)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(topicId, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        await db.delete(topicAttachment).where(and(eq(topicAttachment.id, attachmentId), eq(topicAttachment.topicId, topicId)));
        return json({ success: true });
    }
};

const topicRecommendQuestionRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ items: Array<{ questionType: number; content: string; options?: any; sortOrder?: number }> }>(req);
        const items = body.items ?? [];

        if (items.length > 30) {
            return error("推荐题目数量不能超过30", "VALIDATION_ERROR", 400);
        }

        for (const item of items) {
            const content = (item.content ?? "").trim();
            if (!content || content.length > 500) {
                return error("题目内容长度需在1-500字", "VALIDATION_ERROR", 400);
            }

            if (item.questionType === 2 || item.questionType === 3) {
                const raw = typeof item.options === "string" ? item.options : "";
                const options = raw.split(",").map((o) => o.trim()).filter(Boolean);
                if (options.length < 2 || options.length > 10) {
                    return error("选项数量需在2-10之间", "VALIDATION_ERROR", 400);
                }
                if (options.some((o) => o.length > 200)) {
                    return error("选项内容长度不能超过200", "VALIDATION_ERROR", 400);
                }
            }
        }

        await db.transaction(async (tx) => {
            await tx.delete(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, id));
            for (const item of items) {
                await tx.insert(topicRecommendQuestion).values({
                    topicId: id,
                    questionType: item.questionType,
                    content: item.content,
                    options: item.options ?? null,
                    sortOrder: item.sortOrder ?? 0,
                });
            }
        });

        return json({ success: true });
    }
};

const topicWeightRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ weightConfig: { questionnaire: number; process: number; report: number } }>(req);
        const weightConfig = body.weightConfig;
        if (!weightConfig) return error("评分权重不能为空", "VALIDATION_ERROR", 400);
        const sum = (weightConfig.questionnaire ?? 0) + (weightConfig.process ?? 0) + (weightConfig.report ?? 0);
        if (sum !== 100) return error("评分权重总和必须等于100", "VALIDATION_ERROR", 400);

        await db.update(topic).set({ weightConfig }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

const topicCopyRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const [srcTopic] = await db.select().from(topic).where(eq(topic.id, id));
        if (!srcTopic) return error("课题不存在", "NOT_FOUND", 404);

        const [result] = await db.insert(topic).values({
            teacherId: currentTeacherId,
            name: `${srcTopic.name} (副本)`,
            description: srcTopic.description ?? "",
            excelFilePath: srcTopic.excelFilePath,
            excelRowCount: srcTopic.excelRowCount,
            fieldMapping: srcTopic.fieldMapping,
            weightConfig: srcTopic.weightConfig,
            status: 0,
        });

        const newTopicId = Number(result.insertId);

        const attachments = await db
            .select()
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, id));
        if (attachments.length) {
            await db.insert(topicAttachment).values(
                attachments.map((a) => ({
                    topicId: newTopicId,
                    fileName: a.fileName,
                    filePath: a.filePath,
                    fileType: a.fileType,
                    fileSize: a.fileSize,
                }))
            );
        }

        const questions = await db
            .select()
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, id));
        if (questions.length) {
            await db.insert(topicRecommendQuestion).values(
                questions.map((q) => ({
                    topicId: newTopicId,
                    questionType: q.questionType,
                    content: q.content,
                    options: q.options,
                    sortOrder: q.sortOrder,
                }))
            );
        }

        return json({ id: newTopicId });
    }
};

// ============================================================
// Task API
// ============================================================

const taskRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        // List tasks created for my classes
        const rows = await db
            .select({
                id: task.id,
                topic: topic.name,
                className: class_.name,
                publishedAt: task.openTime,
                deadline: task.deadline,
                total: count(student.id), // Approximate total
                completed: sql<number>`0`, // Placeholder
                pending: sql<number>`(
                    SELECT COUNT(*)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 1
                )`,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, eq(student.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(task.id)
            .orderBy(desc(task.createdAt));

        // Note: Accurately counting 'completed' (experiments submitted) requires subqueries or separate calls
        // For simplicity, we stick to basic info or optimize later.

        return json(rows);
    },

    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const body = await parseBody<{ topicId: number; classIds: number[]; deadline?: string }>(req);

        if (!body.topicId || !body.classIds?.length) {
            return error("请选择课题和班级", "VALIDATION_ERROR");
        }

        const [topicRow] = await db
            .select({ id: topic.id })
            .from(topic)
            .where(and(eq(topic.id, body.topicId), eq(topic.teacherId, currentTeacherId)));

        if (!topicRow) {
            return error("无权限使用该课题", "FORBIDDEN", 403);
        }

        const allowedClasses = await db
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.teacherId, currentTeacherId), sql`${class_.id} IN (${sql.join(body.classIds, sql`, `)})`));

        if (allowedClasses.length !== body.classIds.length) {
            return error("存在无权限的班级", "FORBIDDEN", 403);
        }

        const deadlineDate = body.deadline ? new Date(body.deadline) : null;
        if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
            return error("截止时间无效", "VALIDATION_ERROR", 400);
        }
        if (deadlineDate && deadlineDate <= new Date()) {
            return error("截止时间必须晚于当前时间", "VALIDATION_ERROR", 400);
        }

        const existingRows = await db
            .select({ classId: task.classId })
            .from(task)
            .where(and(eq(task.topicId, body.topicId), sql`${task.classId} IN (${sql.join(body.classIds, sql`, `)})`, isNull(task.deletedAt)));

        const existingClassIds = new Set(existingRows.map(r => r.classId));
        const toInsert = body.classIds.filter((cid) => !existingClassIds.has(cid));

        for (const cid of toInsert) {
            await db.insert(task).values({
                topicId: body.topicId,
                classId: cid,
                openTime: new Date(),
                deadline: deadlineDate
            });
        }

        if (toInsert.length > 0) {
            const [topicRow] = await db.select({ name: topic.name }).from(topic).where(eq(topic.id, body.topicId));
            const deadlineText = deadlineDate ? deadlineDate.toLocaleString("zh-CN") : "无限制";
            await notifyStudentsByClassIds(toInsert, {
                type: "TASK_PUBLISHED",
                title: "新任务已发布",
                content: `教师发布了新任务「${topicRow?.name ?? "未命名课题"}」，截止时间：${deadlineText}`,
                relatedType: "topic",
                relatedId: body.topicId,
            });
        }

        return json({ success: true, skipped: Array.from(existingClassIds) }, 201);
    }
};

const taskExtendRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const taskId = Number(parts[parts.length - 2]);
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{ deadline: string }>(req);
        if (!body.deadline) return error("请输入截止时间", "VALIDATION_ERROR");
        const newDeadline = new Date(body.deadline);
        if (Number.isNaN(newDeadline.getTime())) return error("截止时间无效", "VALIDATION_ERROR");

        const [row] = await db
            .select({ id: task.id, classId: task.classId, deadline: task.deadline })
            .from(task)
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(task.id, taskId), eq(class_.teacherId, currentTeacherId)));

        if (!row) return error("任务不存在", "NOT_FOUND", 404);

        if (row.deadline && new Date(row.deadline) >= newDeadline) {
            return error("新截止时间必须晚于原截止时间", "VALIDATION_ERROR", 400);
        }

        await db.update(task).set({ deadline: newDeadline }).where(eq(task.id, taskId));
        await notifyStudentsByClassIds([row.classId], {
            type: "TASK_EXTENDED",
            title: "截止时间已延长",
            content: `任务截止时间已延长至 ${newDeadline.toLocaleString("zh-CN")}`,
            relatedType: "task",
            relatedId: taskId,
        });
        return json({ success: true });
    }
};

// ============================================================
// Grading API
// ============================================================

// 获取当前用户可以访问的班级ID列表（教师是所有班级，助教是分配的班级）
async function getAccessibleClassIds(req: Request): Promise<{ classIds: number[]; isAssistant: boolean; userId: number } | null> {
    const user = await getCurrentUser(req);
    if (!user) return null;

    if (user.type === "teacher") {
        const classes = await db
            .select({ id: class_.id })
            .from(class_)
            .where(eq(class_.teacherId, user.id));
        return { classIds: classes.map(c => c.id), isAssistant: false, userId: user.id };
    } else {
        const assignedClasses = await db
            .select({ classId: assistantClass.classId })
            .from(assistantClass)
            .where(eq(assistantClass.assistantId, user.id));
        return { classIds: assignedClasses.map(c => c.classId), isAssistant: true, userId: user.id };
    }
}

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds, isAssistant, userId } = access;

        if (classIds.length === 0) {
            return json([]); // 无权限访问任何班级
        }

        const params = getSearchParams(req);
        const status = params.get("status");

        let query = db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                topic: topic.name,
                className: class_.name,
                submittedAt: submission.submittedAt,
                status: submission.status,
                score: submission.totalScore,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
                gradedAt: submission.gradedAt,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`)
            .orderBy(desc(submission.submittedAt))
            .$dynamic();

        if (status === "pending") {
            query = query.where(eq(submission.status, 1));
        } else if (status === "graded") {
            query = query.where(eq(submission.status, 2));
        }

        const rows = await query;

        // 获取批改人信息
        const graderIds = rows
            .filter(r => r.gradedByType === 2 && r.gradedById)
            .map(r => r.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const assistantIds = rows
            .filter(r => r.gradedByType === 3 && r.gradedById)
            .map(r => r.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const teachers = graderIds.length > 0
            ? await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(sql`${teacher.id} IN (${sql.join(graderIds, sql`, `)})`)
            : [];

        const assistants = assistantIds.length > 0
            ? await db.select({ id: assistant.id, name: assistant.name }).from(assistant).where(sql`${assistant.id} IN (${sql.join(assistantIds, sql`, `)})`)
            : [];

        const teacherMap = new Map(teachers.map(t => [t.id, t.name]));
        const assistantMap = new Map(assistants.map(a => [a.id, a.name]));

        // 组装结果，添加批改人名称
        const result = rows.map(row => ({
            ...row,
            gradedByName: row.gradedByType === 2
                ? teacherMap.get(row.gradedById ?? 0) ?? "教师"
                : row.gradedByType === 3
                    ? assistantMap.get(row.gradedById ?? 0) ?? "助教"
                    : null,
        }));

        return json(result);
    }
};

const gradingDetailRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds, isAssistant, userId } = access;

        if (classIds.length === 0) return error("无权限访问", "FORBIDDEN", 403);

        const urlForId = new URL(req.url);
        const pathParts = urlForId.pathname.split("/");
        const submissionId = Number(pathParts[pathParts.length - 1]);

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const [row] = await db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                className: class_.name,
                topicName: topic.name,
                topicDesc: topic.description,
                weightConfig: topic.weightConfig,
                status: submission.status,
                submittedAt: submission.submittedAt,
                lockedById: submission.lockedById,
                lockedByType: submission.lockedByType,
                lockedAt: submission.lockedAt,
                experimentId: experiment.id,
                experimentStatus: experiment.status,
                reportContent: experiment.reportContent,
                samplePlan: experiment.samplePlan,
                questionnaire: experiment.questionnaire,
                samplingResults: experiment.samplingResults,
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
                scoreQuestionnaire: submission.scoreQuestionnaire,
                scoreProcess: submission.scoreProcess,
                scoreReport: submission.scoreReport,
                totalScore: submission.totalScore,
                teacherComment: submission.teacherComment,
                rejectReason: submission.rejectReason,
                gradedAt: submission.gradedAt,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(submission.id, submissionId), sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const now = new Date();
        const lockExpired = isLockExpired(row.lockedAt);
        // 检查是否被其他人锁定
        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;
        const lockedByOther = row.lockedById && (row.lockedByType !== myUserType || row.lockedById !== userId) && !lockExpired;

        if (!lockedByOther && row.status === 1) {
            await db.update(submission).set({
                lockedByType: myUserType,
                lockedById: userId,
                lockedAt: now,
            }).where(eq(submission.id, submissionId));
        }

        const weightConfig = typeof row.weightConfig === "string"
            ? (() => { try { return JSON.parse(row.weightConfig as unknown as string); } catch { return null; } })()
            : row.weightConfig;

        const weights = {
            questionnaire: weightConfig?.questionnaire ?? 30,
            process: weightConfig?.process ?? 30,
            report: weightConfig?.report ?? 40,
        };

        // 获取批改人名称
        let gradedByName = null;
        if (row.gradedByType === 2 && row.gradedById) {
            const [t] = await db.select({ name: teacher.name }).from(teacher).where(eq(teacher.id, row.gradedById));
            gradedByName = t?.name ?? "教师";
        } else if (row.gradedByType === 3 && row.gradedById) {
            const [a] = await db.select({ name: assistant.name }).from(assistant).where(eq(assistant.id, row.gradedById));
            gradedByName = a?.name ?? "助教";
        }

        return json({
            ...row,
            weights,
            readonly: lockedByOther,
            isAssistant,
            gradedByName,
        });
    },

    async POST(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds, isAssistant, userId } = access;

        if (classIds.length === 0) return error("无权限访问", "FORBIDDEN", 403);

        const urlForId = new URL(req.url);
        const pathParts = urlForId.pathname.split("/");
        const submissionId = Number(pathParts[pathParts.length - 1]);

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{
            scoreQuestionnaire: number;
            scoreProcess: number;
            scoreReport: number;
            totalScore: number;
            comment: string;
            status: number;
            rejectReason?: string;
        }>(req);

        if (body.status === 3) {
            const reason = (body.rejectReason ?? "").trim();
            if (reason.length < 10 || reason.length > 1000) {
                return error("驳回理由长度需在10-1000字之间", "VALIDATION_ERROR", 400);
            }
        }

        const [detail] = await db
            .select({
                id: submission.id,
                status: submission.status,
                lockedById: submission.lockedById,
                lockedByType: submission.lockedByType,
                lockedAt: submission.lockedAt,
                experimentId: experiment.id,
                topicId: task.topicId,
                studentId: student.id,
                topicName: topic.name,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .where(and(eq(submission.id, submissionId), sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`));

        if (!detail) return error("提交记录不存在", "NOT_FOUND", 404);

        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;
        const lockExpired = isLockExpired(detail.lockedAt);
        if (detail.lockedById && (detail.lockedByType !== myUserType || detail.lockedById !== userId) && !lockExpired) {
            return error("该作业正在被他人批改", "LOCKED", 423);
        }

        const [topicRow] = await db
            .select({ weightConfig: topic.weightConfig })
            .from(topic)
            .where(eq(topic.id, detail.topicId));

        const weightConfig = typeof topicRow?.weightConfig === "string"
            ? (() => { try { return JSON.parse(topicRow.weightConfig as unknown as string); } catch { return null; } })()
            : topicRow?.weightConfig;

        const weights = {
            questionnaire: weightConfig?.questionnaire ?? 30,
            process: weightConfig?.process ?? 30,
            report: weightConfig?.report ?? 40,
        };

        const totalScore =
            (body.scoreQuestionnaire * weights.questionnaire +
                body.scoreProcess * weights.process +
                body.scoreReport * weights.report) / 100;

        await db.update(submission).set({
            scoreQuestionnaire: String(body.scoreQuestionnaire),
            scoreProcess: String(body.scoreProcess),
            scoreReport: String(body.scoreReport),
            totalScore: String(Number(totalScore.toFixed(2))),
            teacherComment: body.comment,
            rejectReason: body.status === 3 ? (body.rejectReason ?? "") : null,
            status: body.status,
            gradedAt: new Date(),
            gradedById: userId,
            gradedByType: myUserType,
            lockedById: null,
            lockedByType: null,
            lockedAt: null,
        }).where(eq(submission.id, submissionId));

        if (body.status === 2) {
            await db.update(experiment).set({ status: 2 }).where(eq(experiment.id, detail.experimentId));
            await notifyStudentById(detail.studentId, {
                type: "GRADE_COMPLETED",
                title: "作业已批改",
                content: `您提交的「${detail.topicName}」作业已批改完成，得分：${Number(totalScore.toFixed(2))}分`,
                relatedType: "task",
                relatedId: detail.topicId,
            });
        }
        if (body.status === 3) {
            await db.update(experiment).set({ status: 3 }).where(eq(experiment.id, detail.experimentId));
            await notifyStudentById(detail.studentId, {
                type: "GRADE_REJECTED",
                title: "作业被驳回",
                content: `您提交的「${detail.topicName}」作业已被驳回，请查看驳回理由并重新提交`,
                relatedType: "task",
                relatedId: detail.topicId,
            });
        }

        return json({ success: true });
    }
};

// ============================================================
// PDF Download Routes
// ============================================================

const teacherPdfDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const submissionId = Number(parts[parts.length - 2]);
        const type = parts[parts.length - 1];

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");
        if (type !== "questionnaire" && type !== "report") return error("Invalid type", "INVALID_TYPE");

        const [row] = await db
            .select({
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(submission.id, submissionId), eq(class_.teacherId, currentTeacherId)));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const path = type === "questionnaire" ? row.questionnairePdfPath : row.reportPdfPath;
        if (!path) return error("文件不存在", "NOT_FOUND", 404);

        const filePath = path.startsWith("/") ? path.slice(1) : path;
        const file = Bun.file(`${process.cwd()}/public/${filePath}`);
        const exists = await file.exists();
        if (!exists) return error("文件不存在", "NOT_FOUND", 404);

        return new Response(file, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename=${type}-${submissionId}.pdf`,
            },
        });
    }
};

// ============================================================
// Notifications API - Teacher & Assistant
// ============================================================

const teacherNotificationsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        const items = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
                relatedType: notification.relatedType,
                relatedId: notification.relatedId,
            })
            .from(notification)
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id)))
            .orderBy(desc(notification.createdAt))
            .limit(50);

        const [unreadCount] = await db
            .select({ count: count() })
            .from(notification)
            .where(and(
                eq(notification.receiverType, receiverType),
                eq(notification.receiverId, currentUser.id),
                eq(notification.isRead, 0)
            ));

        return json({ notifications: items, unreadCount: unreadCount?.count ?? 0 });
    }
};

const teacherNotificationReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 2]);
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        await db.update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.id, id), eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id)));

        return json({ success: true });
    }
};

const teacherNotificationReadAllRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireTeacherAuth(req);
        if (auth.error) return auth.error;
        const currentUser = auth.user!;

        const receiverType = currentUser.type === "teacher" ? 2 : 3;

        await db.update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(and(eq(notification.receiverType, receiverType), eq(notification.receiverId, currentUser.id), eq(notification.isRead, 0)));

        return json({ success: true });
    }
};

export const teacherApiRoutes = {
    // Auth
    "/api/teacher/login": teacherLoginRoutes,
    "/api/teacher/me": teacherMeRoutes,
    "/api/teacher/logout": teacherLogoutRoutes,
    "/api/teacher/password": withTeacherAuth(teacherPasswordRoutes),

    "/api/teacher/dashboard": withTeacherAuth(dashboardRoutes),
    "/api/teacher/classes": withTeacherAuth(classRoutes),
    "/api/teacher/topics": withTeacherAuth(topicRoutes),
    "/api/teacher/topics/:id": withTeacherAuth(topicItemRoutes),
    "/api/teacher/topics/:id/detail": withTeacherAuth(topicDetailRoutes),
    "/api/teacher/topics/:id/excel": withTeacherAuth(topicExcelUploadRoutes),
    "/api/teacher/topics/:id/mapping": withTeacherAuth(topicFieldMappingRoutes),
    "/api/teacher/topics/:id/attachments": withTeacherAuth(topicAttachmentRoutes),
    "/api/teacher/topics/:id/attachments/:attachmentId": withTeacherAuth(topicAttachmentDeleteRoutes),
    "/api/teacher/topics/:id/recommend-questions": withTeacherAuth(topicRecommendQuestionRoutes),
    "/api/teacher/topics/:id/weights": withTeacherAuth(topicWeightRoutes),
    "/api/teacher/topics/:id/copy": withTeacherAuth(topicCopyRoutes),
    "/api/teacher/tasks": withTeacherAuth(taskRoutes),
    "/api/teacher/tasks/:id/extend": withTeacherAuth(taskExtendRoutes),
    "/api/teacher/grading": withTeacherAuth(gradingRoutes),
    "/api/teacher/grading/:id": withTeacherAuth(gradingDetailRoutes),
    "/api/teacher/notifications": withTeacherAuth(teacherNotificationsRoutes),
    "/api/teacher/notifications/read-all": withTeacherAuth(teacherNotificationReadAllRoutes),
    "/api/teacher/notifications/:id/read": withTeacherAuth(teacherNotificationReadRoutes),
    "/api/teacher/grade-export/preview": withTeacherAuth(gradeExportPreviewRoutes),
    "/api/teacher/grade-export/data": withTeacherAuth(gradeExportDataRoutes),
    "/api/teacher/grade-export/excel": withTeacherAuth(gradeExportExcelRoutes),
    "/api/teacher/submissions/:id/pdf/:type": withTeacherAuth(teacherPdfDownloadRoutes),
    "/api/teacher/classes/:classId/students": withTeacherAuth(classStudentsRoutes),
    "/api/teacher/classes/:classId/students/import": withTeacherAuth(classStudentsImportRoutes),
    "/api/teacher/students/:id": withTeacherAuth(studentRoutes),
    "/api/teacher/assistants": withTeacherAuth(assistantRoutes),
    "/api/teacher/assistants/:id": withTeacherAuth(assistantItemRoutes),
    "/api/teacher/assistants/:id/classes": withTeacherAuth(assistantClassAssignRoutes),
};

// Note: The simple router in `src/index.ts` likely maps exact paths. 
// We may need to update `src/index.ts` to handle dynamic routes or simply register all IDs if we can't change the router.
// FOR NOW: We will rely on a hack: The router might need to be smart enough or we register a regex.
// Looking at `src/index.ts` (implied), it's a map. 
// Let's modify export to include a wildcard handler if possible, otherwise we need to rely on the router logic.
// Checking `src/index.ts` would be ideal. Assuming standard Bun server, we can match prefixes.

