import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
    announcement,
    announcementRead,
    assistant,
    assistantClass,
    class_,
    experiment,
    loginLog,
    operationLog,
    semester,
    student,
    studentTransfer,
    submission,
    task,
    teacher,
    topic,
} from "../../db/schema";
import { error, getClientIp, getRouteParam, getSearchParams, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { ADMIN_USER_TYPE, getAdminUser } from "./auth";

/** Escape SQL LIKE wildcard characters to prevent unintended pattern matching */
function escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function createCountMap(rows: Array<{ key: number; count: number }>) {
    return new Map(rows.map((row) => [row.key, row.count]));
}

async function loadSemesterClassCounts(semesterIds: number[]) {
    if (semesterIds.length === 0) return new Map<number, number>();

    const rows = await db
        .select({
            key: class_.semesterId,
            count: count(),
        })
        .from(class_)
        .where(inArray(class_.semesterId, semesterIds))
        .groupBy(class_.semesterId);

    return createCountMap(rows);
}

async function loadTeacherClassCounts(teacherIds: number[]) {
    if (teacherIds.length === 0) return new Map<number, number>();

    const rows = await db
        .select({
            key: class_.teacherId,
            count: count(),
        })
        .from(class_)
        .where(inArray(class_.teacherId, teacherIds))
        .groupBy(class_.teacherId);

    return createCountMap(rows);
}

async function loadAssistantClassCounts(assistantIds: number[]) {
    if (assistantIds.length === 0) return new Map<number, number>();

    const rows = await db
        .select({
            key: assistantClass.assistantId,
            count: count(),
        })
        .from(assistantClass)
        .where(inArray(assistantClass.assistantId, assistantIds))
        .groupBy(assistantClass.assistantId);

    return createCountMap(rows);
}

async function loadClassStudentCounts(classIds: number[]) {
    if (classIds.length === 0) return new Map<number, number>();

    const rows = await db
        .select({
            key: student.classId,
            count: count(),
        })
        .from(student)
        .where(and(inArray(student.classId, classIds), isNull(student.deletedAt)))
        .groupBy(student.classId);

    return createCountMap(rows);
}

const semesterRoutes: RouteDefinition = {
    async GET() {
        const rows = await db
            .select({
                id: semester.id,
                name: semester.name,
                isCurrent: semester.isCurrent,
                createdAt: semester.createdAt,
            })
            .from(semester)
            .orderBy(desc(semester.createdAt));

        const classCounts = await loadSemesterClassCounts(rows.map((row) => row.id));

        return json(rows.map((row) => ({
            ...row,
            classCount: classCounts.get(row.id) ?? 0,
        })));
    },

    async POST(req) {
        const body = await parseBody<{ name: string; setAsCurrent?: boolean }>(req);
        if (!body.name?.trim()) return error("学期名称不能为空", "VALIDATION_ERROR");

        const [existing] = await db.select().from(semester).where(eq(semester.name, body.name.trim()));
        if (existing) return error("学期名称已存在", "DUPLICATE_NAME");

        let insertId: number;
        if (body.setAsCurrent) {
            insertId = await db.transaction(async (tx) => {
                await tx.update(semester).set({ isCurrent: 0 });
                const [result] = await tx.insert(semester).values({ name: body.name.trim(), isCurrent: 1 });
                return result.insertId;
            });
        } else {
            const [result] = await db.insert(semester).values({ name: body.name.trim(), isCurrent: 0 });
            insertId = result.insertId;
        }
        return json({ id: insertId }, 201);
    },
};

const semesterCurrentRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的学期ID", "INVALID_ID");

        const [targetSemester] = await db.select({ id: semester.id }).from(semester).where(eq(semester.id, id));
        if (!targetSemester) return error("学期不存在", "NOT_FOUND", 404);

        await db.transaction(async (tx) => {
            await tx.update(semester).set({ isCurrent: 0 });
            await tx.update(semester).set({ isCurrent: 1 }).where(eq(semester.id, id));
        });

        return json({ success: true });
    },
};

const semesterDeleteRoutes = {
    async DELETE(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的学期ID", "INVALID_ID");

        const [targetSemester] = await db
            .select({ id: semester.id, isCurrent: semester.isCurrent })
            .from(semester)
            .where(eq(semester.id, id));
        if (!targetSemester) return error("学期不存在", "NOT_FOUND", 404);
        if (targetSemester.isCurrent === 1) return error("当前学期不能删除", "CURRENT_SEMESTER_PROTECTED");

        const [classCount] = await db.select({ count: count() }).from(class_).where(eq(class_.semesterId, id));
        if (classCount && classCount.count > 0) return error("该学期下有班级，无法删除", "HAS_CLASSES");

        await db.delete(semester).where(eq(semester.id, id));
        return json({ success: true });
    },
};

const teacherRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const search = (params.get("search") ?? "").slice(0, 100);

        let query = db
            .select({
                id: teacher.id,
                employeeId: teacher.employeeId,
                name: teacher.name,
                status: teacher.status,
                isFirstLogin: teacher.isFirstLogin,
                lockedUntil: teacher.lockedUntil,
                createdAt: teacher.createdAt,
            })
            .from(teacher)
            .orderBy(desc(teacher.createdAt))
            .$dynamic();

        if (search) {
            const escaped = escapeLike(search);
            query = query.where(or(like(teacher.employeeId, `%${escaped}%`), like(teacher.name, `%${escaped}%`)));
        }

        const rows = await query;
        const teacherIds = rows.map((r) => r.id);
        const classCounts = await loadTeacherClassCounts(teacherIds);
        const lastLogins =
            teacherIds.length > 0
                ? await db
                    .select({ userId: loginLog.userId, lastLogin: sql<Date>`MAX(${loginLog.loginAt})` })
                    .from(loginLog)
                    .where(and(eq(loginLog.userType, 2), inArray(loginLog.userId, teacherIds)))
                    .groupBy(loginLog.userId)
                : [];

        const lastLoginMap = new Map(lastLogins.map((l) => [l.userId, l.lastLogin]));
        return json(rows.map((r) => ({
            ...r,
            classCount: classCounts.get(r.id) ?? 0,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            lastLogin: lastLoginMap.get(r.id) ?? null,
        })));
    },

    async POST(req) {
        const body = await parseBody<{ employeeId: string; name: string }>(req);
        if (!body.employeeId?.trim() || !body.name?.trim()) return error("工号和姓名不能为空", "VALIDATION_ERROR");
        if (body.employeeId.trim().length > 50) return error("工号不能超过50个字符", "VALIDATION_ERROR");
        if (body.name.trim().length > 100) return error("姓名不能超过100个字符", "VALIDATION_ERROR");

        const [existing] = await db.select().from(teacher).where(eq(teacher.employeeId, body.employeeId.trim()));
        if (existing) return error("工号已存在", "DUPLICATE_EMPLOYEE_ID");

        const hashedPassword = await Bun.password.hash(body.employeeId.trim());
        const [result] = await db.insert(teacher).values({ employeeId: body.employeeId.trim(), name: body.name.trim(), password: hashedPassword, isFirstLogin: 1, status: 1 });
        return json({ id: result.insertId }, 201);
    },
};

const teacherUpdateRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ name?: string }>(req);
        if (!id) return error("无效的教师ID", "INVALID_ID");
        if (!body.name?.trim()) return error("姓名不能为空", "VALIDATION_ERROR");
        if (body.name.trim().length > 100) return error("姓名不能超过100个字符", "VALIDATION_ERROR");

        const [t] = await db.select().from(teacher).where(eq(teacher.id, id));
        if (!t) return error("教师不存在", "NOT_FOUND", 404);

        await db.update(teacher).set({ name: body.name.trim() }).where(eq(teacher.id, id));
        return json({ success: true });
    },
};

const teacherStatusRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ status: number }>(req);
        if (!id) return error("无效的教师ID", "INVALID_ID");
        if (body.status !== 0 && body.status !== 1) return error("无效的状态值", "VALIDATION_ERROR");

        const [t] = await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, id));
        if (!t) return error("教师不存在", "NOT_FOUND", 404);

        await db.update(teacher).set({ status: body.status }).where(eq(teacher.id, id));
        return json({ success: true });
    },
};

const teacherUnlockRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的教师ID", "INVALID_ID");

        const [t] = await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, id));
        if (!t) return error("教师不存在", "NOT_FOUND", 404);

        await db.update(teacher).set({ lockedUntil: null, loginFailCount: 0 }).where(eq(teacher.id, id));
        return json({ success: true });
    },
};

const teacherResetPasswordRoutes = {
    async POST(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的教师ID", "INVALID_ID");

        const [t] = await db.select().from(teacher).where(eq(teacher.id, id));
        if (!t) return error("教师不存在", "NOT_FOUND", 404);

        const hashedPassword = await Bun.password.hash(t.employeeId);
        await db.update(teacher).set({ password: hashedPassword, isFirstLogin: 1 }).where(eq(teacher.id, id));

        return json({ success: true });
    },
};

const assistantRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const teacherId = params.get("teacher_id");

        let query = db
            .select({
                id: assistant.id,
                account: assistant.account,
                name: assistant.name,
                creatorTeacherId: assistant.creatorTeacherId,
                status: assistant.status,
                lockedUntil: assistant.lockedUntil,
                createdAt: assistant.createdAt,
                teacherName: teacher.name,
            })
            .from(assistant)
            .leftJoin(teacher, eq(assistant.creatorTeacherId, teacher.id))
            .orderBy(desc(assistant.createdAt))
            .$dynamic();

        if (teacherId && teacherId !== "all") {
            const parsed = parseInt(teacherId, 10);
            if (Number.isFinite(parsed) && parsed > 0) query = query.where(eq(assistant.creatorTeacherId, parsed));
        }

        const rows = await query;
        const assistantIds = rows.map((r) => r.id);
        const classCounts = await loadAssistantClassCounts(assistantIds);
        const lastLogins =
            assistantIds.length > 0
                ? await db
                    .select({ userId: loginLog.userId, lastLogin: sql<Date>`MAX(${loginLog.loginAt})` })
                    .from(loginLog)
                    .where(and(eq(loginLog.userType, 3), inArray(loginLog.userId, assistantIds)))
                    .groupBy(loginLog.userId)
                : [];
        const lastLoginMap = new Map(lastLogins.map((l) => [l.userId, l.lastLogin]));
        return json(rows.map((r) => ({
            ...r,
            classCount: classCounts.get(r.id) ?? 0,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            lastLogin: lastLoginMap.get(r.id) ?? null,
        })));
    },

    async POST(req) {
        const body = await parseBody<{ account: string; name: string; teacherId: number }>(req);
        if (!body.account?.trim() || !body.name?.trim() || !body.teacherId) return error("账号、姓名和所属教师不能为空", "VALIDATION_ERROR");
        if (body.account.trim().length > 50) return error("账号不能超过50个字符", "VALIDATION_ERROR");
        if (body.name.trim().length > 100) return error("姓名不能超过100个字符", "VALIDATION_ERROR");
        if (!Number.isInteger(body.teacherId) || body.teacherId <= 0) return error("无效的教师ID", "VALIDATION_ERROR");

        const [t] = await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, body.teacherId));
        if (!t) return error("所属教师不存在", "NOT_FOUND", 404);

        const [existing] = await db.select().from(assistant).where(eq(assistant.account, body.account.trim()));
        if (existing) return error("账号已存在", "DUPLICATE_ACCOUNT");

        const hashedPassword = await Bun.password.hash(body.account.trim());
        const [result] = await db.insert(assistant).values({
            account: body.account.trim(),
            name: body.name.trim(),
            password: hashedPassword,
            creatorTeacherId: body.teacherId,
            isFirstLogin: 1,
            status: 1,
        });

        return json({ id: result.insertId }, 201);
    },
};

const assistantStatusRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ status: number }>(req);
        if (!id) return error("无效的助教ID", "INVALID_ID");
        if (body.status !== 0 && body.status !== 1) return error("无效的状态值", "VALIDATION_ERROR");

        const [a] = await db.select({ id: assistant.id }).from(assistant).where(eq(assistant.id, id));
        if (!a) return error("助教不存在", "NOT_FOUND", 404);

        await db.update(assistant).set({ status: body.status }).where(eq(assistant.id, id));
        return json({ success: true });
    },
};

const assistantDeleteRoutes = {
    async DELETE(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的助教ID", "INVALID_ID");

        const [a] = await db.select({ id: assistant.id }).from(assistant).where(eq(assistant.id, id));
        if (!a) return error("助教不存在", "NOT_FOUND", 404);

        await db.delete(assistantClass).where(eq(assistantClass.assistantId, id));
        await db.delete(assistant).where(eq(assistant.id, id));
        return json({ success: true });
    },
};

const assistantUnlockRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的助教ID", "INVALID_ID");

        const [a] = await db.select({ id: assistant.id }).from(assistant).where(eq(assistant.id, id));
        if (!a) return error("助教不存在", "NOT_FOUND", 404);

        await db.update(assistant).set({ lockedUntil: null, loginFailCount: 0 }).where(eq(assistant.id, id));
        return json({ success: true });
    },
};

const assistantResetPasswordRoutes = {
    async POST(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的助教ID", "INVALID_ID");

        const [a] = await db.select().from(assistant).where(eq(assistant.id, id));
        if (!a) return error("助教不存在", "NOT_FOUND", 404);

        const hashedPassword = await Bun.password.hash(a.account);
        await db.update(assistant).set({ password: hashedPassword, isFirstLogin: 1 }).where(eq(assistant.id, id));

        return json({ success: true });
    },
};

const classRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const semesterId = params.get("semester_id");
        const teacherId = params.get("teacher_id");

        let query = db
            .select({
                id: class_.id,
                name: class_.name,
                semesterId: class_.semesterId,
                teacherId: class_.teacherId,
                createdAt: class_.createdAt,
                semesterName: semester.name,
                teacherName: teacher.name,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(teacher, eq(class_.teacherId, teacher.id))
            .orderBy(desc(class_.createdAt))
            .$dynamic();

        const conditions = [];
        if (semesterId && semesterId !== "all") {
            const parsed = parseInt(semesterId, 10);
            if (Number.isFinite(parsed) && parsed > 0) conditions.push(eq(class_.semesterId, parsed));
        }
        if (teacherId && teacherId !== "all") {
            const parsed = parseInt(teacherId, 10);
            if (Number.isFinite(parsed) && parsed > 0) conditions.push(eq(class_.teacherId, parsed));
        }
        if (conditions.length > 0) query = query.where(and(...conditions));

        const rows = await query;
        const studentCounts = await loadClassStudentCounts(rows.map((row) => row.id));

        return json(rows.map((row) => ({
            ...row,
            studentCount: studentCounts.get(row.id) ?? 0,
        })));
    },

    async POST(req) {
        const body = await parseBody<{ name: string; semesterId: number; teacherId: number }>(req);
        if (!body.name?.trim() || !body.semesterId || !body.teacherId) return error("班级名称、学期和教师不能为空", "VALIDATION_ERROR");
        if (!Number.isInteger(body.semesterId) || body.semesterId <= 0) return error("无效的学期ID", "VALIDATION_ERROR");
        if (!Number.isInteger(body.teacherId) || body.teacherId <= 0) return error("无效的教师ID", "VALIDATION_ERROR");

        const [s] = await db.select({ id: semester.id }).from(semester).where(eq(semester.id, body.semesterId));
        if (!s) return error("学期不存在", "NOT_FOUND", 404);
        const [t] = await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.id, body.teacherId));
        if (!t) return error("教师不存在", "NOT_FOUND", 404);

        const [result] = await db.insert(class_).values({ name: body.name.trim(), semesterId: body.semesterId, teacherId: body.teacherId });
        return json({ id: result.insertId }, 201);
    },
};

const classUpdateRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ name?: string; teacherId?: number }>(req);
        if (!id) return error("无效的班级ID", "INVALID_ID");

        const [c] = await db.select({ id: class_.id }).from(class_).where(eq(class_.id, id));
        if (!c) return error("班级不存在", "NOT_FOUND", 404);

        const updates: Record<string, unknown> = {};
        if (body.name?.trim()) updates.name = body.name.trim();
        if (body.teacherId) updates.teacherId = body.teacherId;

        if (Object.keys(updates).length > 0) await db.update(class_).set(updates).where(eq(class_.id, id));
        return json({ success: true });
    },

    async DELETE(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的班级ID", "INVALID_ID");

        const [c] = await db.select({ id: class_.id }).from(class_).where(eq(class_.id, id));
        if (!c) return error("班级不存在", "NOT_FOUND", 404);

        await db.transaction(async (tx) => {
            await tx.update(student).set({ deletedAt: new Date() }).where(eq(student.classId, id));
            await tx.delete(class_).where(eq(class_.id, id));
        });
        return json({ success: true });
    },
};

const studentRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const classId = params.get("class_id");
        const search = (params.get("search") ?? "").slice(0, 100);

        let query = db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                classId: student.classId,
                status: student.status,
                lockedUntil: student.lockedUntil,
                createdAt: student.createdAt,
                className: class_.name,
            })
            .from(student)
            .leftJoin(class_, eq(student.classId, class_.id))
            .orderBy(desc(student.createdAt))
            .$dynamic();

        const conditions = [isNull(student.deletedAt)];
        if (classId && classId !== "all") {
            const parsed = parseInt(classId, 10);
            if (Number.isFinite(parsed) && parsed > 0) conditions.push(eq(student.classId, parsed));
        }
        if (search) {
            const escaped = escapeLike(search);
            conditions.push(or(like(student.studentId, `%${escaped}%`), like(student.name, `%${escaped}%`))!);
        }
        query = query.where(and(...conditions));

        const rows = await query;
        const studentIds = rows.map((r) => r.id);
        const lastActives =
            studentIds.length > 0
                ? await db
                    .select({ userId: loginLog.userId, lastActive: sql<Date>`MAX(${loginLog.loginAt})` })
                    .from(loginLog)
                    .where(and(eq(loginLog.userType, 4), inArray(loginLog.userId, studentIds)))
                    .groupBy(loginLog.userId)
                : [];
        const lastActiveMap = new Map(lastActives.map((l) => [l.userId, l.lastActive]));

        const experiments =
            studentIds.length > 0
                ? await db.select({ studentId: experiment.studentId, currentStage: experiment.currentStage, status: experiment.status }).from(experiment).where(inArray(experiment.studentId, studentIds))
                : [];

        const progressMap = new Map();
        experiments.forEach((e) => {
            const p = e.status === 1 ? 100 : Math.min(e.currentStage * 25, 100);
            const current = progressMap.get(e.studentId) || 0;
            if (p > current) progressMap.set(e.studentId, p);
        });

        return json(rows.map((r) => ({ ...r, isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false, progress: progressMap.get(r.id) || 0, lastActive: lastActiveMap.get(r.id) || null })));
    },
};

const studentExperimentsRoutes = {
    async GET(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的学生ID", "INVALID_ID");

        const rows = await db
            .select({
                id: experiment.id,
                taskName: topic.name,
                currentStage: experiment.currentStage,
                status: experiment.status,
                submitTime: experiment.stage4CompletedAt,
                score: submission.totalScore,
                lastUpdate: experiment.updatedAt,
            })
            .from(experiment)
            .leftJoin(task, eq(experiment.taskId, task.id))
            .leftJoin(topic, eq(task.topicId, topic.id))
            .leftJoin(submission, eq(submission.experimentId, experiment.id))
            .where(eq(experiment.studentId, id))
            .orderBy(desc(experiment.updatedAt));

        return json(rows.map((r) => ({ ...r, progress: r.status >= 1 ? 100 : Math.min(r.currentStage * 25, 100), statusText: r.status === 2 ? "已批改" : r.status === 1 ? "已提交" : "进行中" })));
    },
};

const studentStatusRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ status: number }>(req);
        if (!id) return error("无效的学生ID", "INVALID_ID");
        if (body.status !== 0 && body.status !== 1) return error("无效的状态值", "VALIDATION_ERROR");

        const [s] = await db.select({ id: student.id }).from(student).where(eq(student.id, id));
        if (!s) return error("学生不存在", "NOT_FOUND", 404);

        await db.update(student).set({ status: body.status }).where(eq(student.id, id));
        return json({ success: true });
    },
};

const studentUnlockRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的学生ID", "INVALID_ID");

        const [s] = await db.select({ id: student.id }).from(student).where(eq(student.id, id));
        if (!s) return error("学生不存在", "NOT_FOUND", 404);

        await db.update(student).set({ lockedUntil: null, loginFailCount: 0 }).where(eq(student.id, id));
        return json({ success: true });
    },
};

const studentResetPasswordRoutes = {
    async POST(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的学生ID", "INVALID_ID");

        const [s] = await db.select().from(student).where(eq(student.id, id));
        if (!s) return error("学生不存在", "NOT_FOUND", 404);

        const hashedPassword = await Bun.password.hash(s.studentId);
        await db.update(student).set({ password: hashedPassword, isFirstLogin: 1 }).where(eq(student.id, id));
        return json({ success: true });
    },
};

const studentTransferRoutes = {
    async POST(req: Request) {
        const adm = getAdminUser(req);
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ targetClassId: number; reason?: string }>(req);
        if (!id) return error("无效的学生ID", "INVALID_ID");
        if (!body.targetClassId) return error("目标班级不能为空", "VALIDATION_ERROR");
        if (body.reason && body.reason.trim().length > 500) return error("转班原因不能超过500个字符", "VALIDATION_ERROR");

        const [s] = await db.select().from(student).where(eq(student.id, id));
        if (!s) return error("学生不存在", "NOT_FOUND", 404);

        const [targetClass] = await db.select().from(class_).where(eq(class_.id, body.targetClassId));
        if (!targetClass) return error("目标班级不存在", "NOT_FOUND", 404);
        if (s.classId === body.targetClassId) return error("学生已在该班级", "SAME_CLASS");

        await db.insert(studentTransfer).values({ studentId: id, fromClassId: s.classId, toClassId: body.targetClassId, reason: body.reason, operatedBy: adm.id });
        await db.update(student).set({ classId: body.targetClassId }).where(eq(student.id, id));

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            action: "STUDENT_TRANSFER",
            targetType: "student",
            targetId: id,
            detail: { fromClassId: s.classId, toClassId: body.targetClassId, reason: body.reason },
            ipAddress: getClientIp(req),
        });

        return json({ success: true });
    },
};

const announcementRoutes: RouteDefinition = {
    async GET() {
        return json(await db.select().from(announcement).orderBy(desc(announcement.createdAt)));
    },

    async POST(req) {
        const body = await parseBody<{ title: string; content: string; publish?: boolean; targetScope?: string }>(req);
        if (!body.title?.trim() || !body.content?.trim()) return error("标题和内容不能为空", "VALIDATION_ERROR");
        if (body.title.trim().length > 100) return error("公告标题不能超过100个字符", "VALIDATION_ERROR");
        if (body.content.trim().length > 10000) return error("公告内容不能超过10000个字符", "VALIDATION_ERROR");

        const validScopes = ["all", "teacher", "student", "assistant"];
        const scope = body.targetScope && validScopes.includes(body.targetScope) ? body.targetScope : "all";

        const [result] = await db.insert(announcement).values({
            title: body.title.trim(),
            content: body.content.trim(),
            targetScope: scope,
            status: body.publish ? 1 : 0,
        });
        return json({ id: result.insertId }, 201);
    },
};

const announcementUpdateRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        const body = await parseBody<{ title?: string; content?: string }>(req);
        if (!id) return error("无效的公告ID", "INVALID_ID");
        if (body.title && body.title.trim().length > 100) return error("公告标题不能超过100个字符", "VALIDATION_ERROR");
        if (body.content && body.content.trim().length > 10000) return error("公告内容不能超过10000个字符", "VALIDATION_ERROR");

        const [existing] = await db.select({ id: announcement.id }).from(announcement).where(eq(announcement.id, id));
        if (!existing) return error("公告不存在", "NOT_FOUND", 404);

        const updates: Record<string, unknown> = {};
        if (body.title?.trim()) updates.title = body.title.trim();
        if (body.content?.trim()) updates.content = body.content.trim();
        if (Object.keys(updates).length > 0) await db.update(announcement).set(updates).where(eq(announcement.id, id));
        return json({ success: true });
    },

    async DELETE(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的公告ID", "INVALID_ID");

        const [existing] = await db.select({ id: announcement.id }).from(announcement).where(eq(announcement.id, id));
        if (!existing) return error("公告不存在", "NOT_FOUND", 404);

        await db.delete(announcement).where(eq(announcement.id, id));
        return json({ success: true });
    },
};

const announcementPublishRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的公告ID", "INVALID_ID");

        const [existing] = await db.select({ id: announcement.id }).from(announcement).where(eq(announcement.id, id));
        if (!existing) return error("公告不存在", "NOT_FOUND", 404);

        await db.update(announcement).set({ status: 1 }).where(eq(announcement.id, id));
        return json({ success: true });
    },
};

const announcementUnpublishRoutes = {
    async PUT(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的公告ID", "INVALID_ID");

        const [existing] = await db.select({ id: announcement.id }).from(announcement).where(eq(announcement.id, id));
        if (!existing) return error("公告不存在", "NOT_FOUND", 404);

        await db.update(announcement).set({ status: 0 }).where(eq(announcement.id, id));
        return json({ success: true });
    },
};

const announcementStatsRoutes = {
    async GET(req: Request) {
        const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!id) return error("无效的公告ID", "INVALID_ID");

        const [an] = await db.select().from(announcement).where(eq(announcement.id, id));
        if (!an) return error("公告不存在", "NOT_FOUND", 404);
        if (an.status !== 1) return error("草稿公告暂无阅读统计", "ANNOUNCEMENT_NOT_PUBLISHED");

        const scope = an.targetScope ?? "all";
        const includeTeacher = scope === "all" || scope === "teacher";
        const includeAssistant = scope === "all" || scope === "assistant";
        const includeStudent = scope === "all" || scope === "student";

        const [tCount] = includeTeacher
            ? await db.select({ count: count() }).from(teacher).where(eq(teacher.status, 1))
            : [{ count: 0 }];
        const [aCount] = includeAssistant
            ? await db.select({ count: count() }).from(assistant).where(eq(assistant.status, 1))
            : [{ count: 0 }];
        const [sCount] = includeStudent
            ? await db.select({ count: count() }).from(student).where(and(eq(student.status, 1), isNull(student.deletedAt)))
            : [{ count: 0 }];
        const totalCount = (tCount?.count ?? 0) + (aCount?.count ?? 0) + (sCount?.count ?? 0);

        const [rCount] = await db.select({ count: count() }).from(announcementRead).where(eq(announcementRead.announcementId, id));
        const readCount = rCount?.count ?? 0;
        const readRate = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

        // Per-role read counts: userType 2=teacher, 3=assistant, 4=student
        const roleReads = await db
            .select({ userType: announcementRead.userType, count: count() })
            .from(announcementRead)
            .where(eq(announcementRead.announcementId, id))
            .groupBy(announcementRead.userType);

        const roleReadMap = new Map(roleReads.map(r => [r.userType, r.count]));

        const byRole: { role: string; readCount: number; totalCount: number }[] = [];
        if (includeTeacher) byRole.push({ role: "教师", readCount: roleReadMap.get(2) ?? 0, totalCount: tCount?.count ?? 0 });
        if (includeAssistant) byRole.push({ role: "助教", readCount: roleReadMap.get(3) ?? 0, totalCount: aCount?.count ?? 0 });
        if (includeStudent) byRole.push({ role: "学生", readCount: roleReadMap.get(4) ?? 0, totalCount: sCount?.count ?? 0 });

        return json({ readCount, totalCount, readRate, byRole });
    },
};

export {
    announcementPublishRoutes,
    announcementRoutes,
    announcementStatsRoutes,
    announcementUnpublishRoutes,
    announcementUpdateRoutes,
    assistantDeleteRoutes,
    assistantResetPasswordRoutes,
    assistantRoutes,
    assistantStatusRoutes,
    assistantUnlockRoutes,
    classRoutes,
    classUpdateRoutes,
    semesterCurrentRoutes,
    semesterDeleteRoutes,
    semesterRoutes,
    studentExperimentsRoutes,
    studentResetPasswordRoutes,
    studentRoutes,
    studentStatusRoutes,
    studentTransferRoutes,
    studentUnlockRoutes,
    teacherResetPasswordRoutes,
    teacherRoutes,
    teacherStatusRoutes,
    teacherUnlockRoutes,
    teacherUpdateRoutes,
};
