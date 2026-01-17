/**
 * Admin API Routes
 * 管理员端 API 接口集合
 */

import { db } from "../db";
import {
    semester,
    teacher,
    assistant,
    class_,
    student,
    announcement,
    loginLog,
    assistantClass,
} from "../db/schema";
import { eq, desc, asc, sql, and, like, or, isNull, count } from "drizzle-orm";

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

function json<T>(data: T, status = 200): Response {
    return Response.json({ success: true, data }, { status });
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

// ============================================================
// Stats API
// ============================================================

const statsRoutes: RouteDefinition = {
    async GET() {
        const [[semesterRow], [teacherCount], [classCount], [studentCount], [assistantCount]] =
            await Promise.all([
                db.select().from(semester).where(eq(semester.isCurrent, 1)).limit(1),
                db.select({ count: count() }).from(teacher).where(eq(teacher.status, 1)),
                db.select({ count: count() }).from(class_),
                db.select({ count: count() }).from(student).where(isNull(student.deletedAt)),
                db.select({ count: count() }).from(assistant).where(eq(assistant.status, 1)),
            ]);

        // 今日登录统计
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todayLogins] = await db
            .select({ count: count() })
            .from(loginLog)
            .where(sql`${loginLog.loginAt} >= ${today}`);

        return json({
            currentSemester: semesterRow?.name ?? "未设置",
            teacherCount: teacherCount?.count ?? 0,
            classCount: classCount?.count ?? 0,
            studentCount: studentCount?.count ?? 0,
            assistantCount: assistantCount?.count ?? 0,
            todayLogins: todayLogins?.count ?? 0,
            todayActiveUsers: 0, // TODO: 从 session 表统计
            pendingItems: 0, // TODO: 统计待处理事项
        });
    },
};

// ============================================================
// Semester API
// ============================================================

const semesterRoutes: RouteDefinition = {
    async GET() {
        const rows = await db
            .select({
                id: semester.id,
                name: semester.name,
                isCurrent: semester.isCurrent,
                createdAt: semester.createdAt,
                classCount: sql<number>`(SELECT COUNT(*) FROM class WHERE class.semester_id = ${semester.id})`,
            })
            .from(semester)
            .orderBy(desc(semester.createdAt));

        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ name: string; setAsCurrent?: boolean }>(req);

        if (!body.name?.trim()) {
            return error("学期名称不能为空", "VALIDATION_ERROR");
        }

        // 检查名称是否重复
        const [existing] = await db
            .select()
            .from(semester)
            .where(eq(semester.name, body.name.trim()));

        if (existing) {
            return error("学期名称已存在", "DUPLICATE_NAME");
        }

        // 如果设为当前学期，先取消其他学期的当前状态
        if (body.setAsCurrent) {
            await db.update(semester).set({ isCurrent: 0 });
        }

        const [result] = await db.insert(semester).values({
            name: body.name.trim(),
            isCurrent: body.setAsCurrent ? 1 : 0,
        });

        return json({ id: result.insertId }, 201);
    },
};

const semesterCurrentRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        // 取消所有学期的当前状态
        await db.update(semester).set({ isCurrent: 0 });

        // 设置指定学期为当前
        await db.update(semester).set({ isCurrent: 1 }).where(eq(semester.id, id));

        return json({ success: true });
    },
};

const semesterDeleteRoutes = {
    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        // 检查是否有关联班级
        const [classCount] = await db
            .select({ count: count() })
            .from(class_)
            .where(eq(class_.semesterId, id));

        if (classCount && classCount.count > 0) {
            return error("该学期下有班级，无法删除", "HAS_CLASSES");
        }

        await db.delete(semester).where(eq(semester.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Teacher API
// ============================================================

const teacherRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const search = params.get("search") ?? "";

        let query = db
            .select({
                id: teacher.id,
                employeeId: teacher.employeeId,
                name: teacher.name,
                status: teacher.status,
                isFirstLogin: teacher.isFirstLogin,
                lockedUntil: teacher.lockedUntil,
                createdAt: teacher.createdAt,
                classCount: sql<number>`(SELECT COUNT(*) FROM class WHERE class.teacher_id = ${teacher.id})`,
            })
            .from(teacher)
            .orderBy(desc(teacher.createdAt))
            .$dynamic();

        if (search) {
            query = query.where(
                or(
                    like(teacher.employeeId, `%${search}%`),
                    like(teacher.name, `%${search}%`)
                )
            );
        }

        const rows = await query;

        // 获取最后登录时间
        const teacherIds = rows.map((r) => r.id);
        const lastLogins =
            teacherIds.length > 0
                ? await db
                      .select({
                          userId: loginLog.userId,
                          lastLogin: sql<Date>`MAX(${loginLog.loginAt})`,
                      })
                      .from(loginLog)
                      .where(
                          and(
                              eq(loginLog.userType, 2), // 2 = teacher
                              sql`${loginLog.userId} IN (${sql.join(teacherIds, sql`, `)})`
                          )
                      )
                      .groupBy(loginLog.userId)
                : [];

        const lastLoginMap = new Map(lastLogins.map((l) => [l.userId, l.lastLogin]));

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            lastLogin: lastLoginMap.get(r.id) ?? null,
        }));

        return json(result);
    },

    async POST(req) {
        const body = await parseBody<{ employeeId: string; name: string }>(req);

        if (!body.employeeId?.trim() || !body.name?.trim()) {
            return error("工号和姓名不能为空", "VALIDATION_ERROR");
        }

        // 检查工号是否重复
        const [existing] = await db
            .select()
            .from(teacher)
            .where(eq(teacher.employeeId, body.employeeId.trim()));

        if (existing) {
            return error("工号已存在", "DUPLICATE_EMPLOYEE_ID");
        }

        // 密码使用工号，实际应用中应该加密
        const hashedPassword = await Bun.password.hash(body.employeeId.trim());

        const [result] = await db.insert(teacher).values({
            employeeId: body.employeeId.trim(),
            name: body.name.trim(),
            password: hashedPassword,
            isFirstLogin: 1,
            status: 1,
        });

        return json({ id: result.insertId }, 201);
    },
};

const teacherStatusRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        await db
            .update(teacher)
            .set({ status: body.status })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

const teacherUnlockRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        await db
            .update(teacher)
            .set({ lockedUntil: null, loginFailCount: 0 })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

const teacherResetPasswordRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        // 获取教师信息
        const [t] = await db.select().from(teacher).where(eq(teacher.id, id));

        if (!t) {
            return error("教师不存在", "NOT_FOUND", 404);
        }

        // 重置密码为工号
        const hashedPassword = await Bun.password.hash(t.employeeId);

        await db
            .update(teacher)
            .set({ password: hashedPassword, isFirstLogin: 1 })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Assistant API
// ============================================================

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
                classCount: sql<number>`(SELECT COUNT(*) FROM assistant_class WHERE assistant_class.assistant_id = ${assistant.id})`,
            })
            .from(assistant)
            .leftJoin(teacher, eq(assistant.creatorTeacherId, teacher.id))
            .orderBy(desc(assistant.createdAt))
            .$dynamic();

        if (teacherId && teacherId !== "all") {
            query = query.where(eq(assistant.creatorTeacherId, parseInt(teacherId)));
        }

        const rows = await query;

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
        }));

        return json(result);
    },

    async POST(req) {
        const body = await parseBody<{ account: string; name: string; teacherId: number }>(req);

        if (!body.account?.trim() || !body.name?.trim() || !body.teacherId) {
            return error("账号、姓名和所属教师不能为空", "VALIDATION_ERROR");
        }

        // 检查账号是否重复
        const [existing] = await db
            .select()
            .from(assistant)
            .where(eq(assistant.account, body.account.trim()));

        if (existing) {
            return error("账号已存在", "DUPLICATE_ACCOUNT");
        }

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
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        await db
            .update(assistant)
            .set({ status: body.status })
            .where(eq(assistant.id, id));

        return json({ success: true });
    },
};

const assistantDeleteRoutes = {
    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        // 删除助教班级关联
        await db.delete(assistantClass).where(eq(assistantClass.assistantId, id));

        // 删除助教
        await db.delete(assistant).where(eq(assistant.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Class API
// ============================================================

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
                studentCount: sql<number>`(SELECT COUNT(*) FROM student WHERE student.class_id = ${class_.id} AND student.deleted_at IS NULL)`,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(teacher, eq(class_.teacherId, teacher.id))
            .orderBy(desc(class_.createdAt))
            .$dynamic();

        const conditions = [];
        if (semesterId && semesterId !== "all") {
            conditions.push(eq(class_.semesterId, parseInt(semesterId)));
        }
        if (teacherId && teacherId !== "all") {
            conditions.push(eq(class_.teacherId, parseInt(teacherId)));
        }
        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        const rows = await query;
        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ name: string; semesterId: number; teacherId: number }>(req);

        if (!body.name?.trim() || !body.semesterId || !body.teacherId) {
            return error("班级名称、学期和教师不能为空", "VALIDATION_ERROR");
        }

        const [result] = await db.insert(class_).values({
            name: body.name.trim(),
            semesterId: body.semesterId,
            teacherId: body.teacherId,
        });

        return json({ id: result.insertId }, 201);
    },
};

const classUpdateRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");
        const body = await parseBody<{ name?: string; teacherId?: number }>(req);

        if (!id) {
            return error("无效的班级ID", "INVALID_ID");
        }

        const updates: Record<string, unknown> = {};
        if (body.name?.trim()) updates.name = body.name.trim();
        if (body.teacherId) updates.teacherId = body.teacherId;

        if (Object.keys(updates).length > 0) {
            await db.update(class_).set(updates).where(eq(class_.id, id));
        }

        return json({ success: true });
    },

    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的班级ID", "INVALID_ID");
        }

        // 软删除班级内的学生
        await db
            .update(student)
            .set({ deletedAt: new Date() })
            .where(eq(student.classId, id));

        // 删除班级
        await db.delete(class_).where(eq(class_.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Student API
// ============================================================

const studentRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const classId = params.get("class_id");
        const search = params.get("search") ?? "";

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
            .where(isNull(student.deletedAt))
            .orderBy(desc(student.createdAt))
            .$dynamic();

        const conditions = [isNull(student.deletedAt)];
        if (classId && classId !== "all") {
            conditions.push(eq(student.classId, parseInt(classId)));
        }
        if (search) {
            conditions.push(
                or(
                    like(student.studentId, `%${search}%`),
                    like(student.name, `%${search}%`)
                )!
            );
        }

        query = query.where(and(...conditions));

        const rows = await query;

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            progress: 0, // TODO: 计算实验进度
        }));

        return json(result);
    },
};

const studentStatusRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }

        await db.update(student).set({ status: body.status }).where(eq(student.id, id));

        return json({ success: true });
    },
};

const studentResetPasswordRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }

        const [s] = await db.select().from(student).where(eq(student.id, id));

        if (!s) {
            return error("学生不存在", "NOT_FOUND", 404);
        }

        const hashedPassword = await Bun.password.hash(s.studentId);

        await db
            .update(student)
            .set({ password: hashedPassword, isFirstLogin: 1 })
            .where(eq(student.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Announcement API
// ============================================================

const announcementRoutes: RouteDefinition = {
    async GET() {
        const rows = await db
            .select()
            .from(announcement)
            .orderBy(desc(announcement.createdAt));

        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ title: string; content: string; publish?: boolean }>(req);

        if (!body.title?.trim() || !body.content?.trim()) {
            return error("标题和内容不能为空", "VALIDATION_ERROR");
        }

        const [result] = await db.insert(announcement).values({
            title: body.title.trim(),
            content: body.content.trim(),
            status: body.publish ? 1 : 0,
        });

        return json({ id: result.insertId }, 201);
    },
};

const announcementUpdateRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");
        const body = await parseBody<{ title?: string; content?: string }>(req);

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        const updates: Record<string, unknown> = {};
        if (body.title?.trim()) updates.title = body.title.trim();
        if (body.content?.trim()) updates.content = body.content.trim();

        if (Object.keys(updates).length > 0) {
            await db.update(announcement).set(updates).where(eq(announcement.id, id));
        }

        return json({ success: true });
    },

    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.delete(announcement).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

const announcementPublishRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.update(announcement).set({ status: 1 }).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

const announcementUnpublishRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.update(announcement).set({ status: 0 }).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Export Routes
// ============================================================

export const adminApiRoutes = {
    // Stats
    "/api/admin/stats": statsRoutes,

    // Semesters
    "/api/admin/semesters": semesterRoutes,
    "/api/admin/semesters/:id/current": semesterCurrentRoutes,
    "/api/admin/semesters/:id": semesterDeleteRoutes,

    // Teachers
    "/api/admin/teachers": teacherRoutes,
    "/api/admin/teachers/:id/status": teacherStatusRoutes,
    "/api/admin/teachers/:id/unlock": teacherUnlockRoutes,
    "/api/admin/teachers/:id/reset-password": teacherResetPasswordRoutes,

    // Assistants
    "/api/admin/assistants": assistantRoutes,
    "/api/admin/assistants/:id/status": assistantStatusRoutes,
    "/api/admin/assistants/:id": assistantDeleteRoutes,

    // Classes
    "/api/admin/classes": classRoutes,
    "/api/admin/classes/:id": classUpdateRoutes,

    // Students
    "/api/admin/students": studentRoutes,
    "/api/admin/students/:id/status": studentStatusRoutes,
    "/api/admin/students/:id/reset-password": studentResetPasswordRoutes,

    // Announcements
    "/api/admin/announcements": announcementRoutes,
    "/api/admin/announcements/:id": announcementUpdateRoutes,
    "/api/admin/announcements/:id/publish": announcementPublishRoutes,
    "/api/admin/announcements/:id/unpublish": announcementUnpublishRoutes,
};
