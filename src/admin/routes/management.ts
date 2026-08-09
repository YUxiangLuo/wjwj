import { and, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { announcement, class_, experiment, semester, student, task, teacher, topic } from "../../db/schema";
import { experimentProgress } from "../../lib/experiment-progress";
import { error, getRouteParam, getSearchParams, json, parseBody, stringValue } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { clearUserSessionsForUser } from "../../server/user-session";
import { STUDENT_USER_TYPE } from "../../student/routes/auth";
import { TEACHER_USER_TYPE } from "../../teacher/routes/auth";

function parseId(req: Request, name = "id") {
    const value = Number.parseInt(getRouteParam(req, name) ?? "", 10);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function escapeLike(value: string) {
    return value.replace(/[%_\\]/g, (character) => `\\${character}`);
}

async function loadCounts<T extends number>(
    ids: T[],
    loader: () => Promise<Array<{ key: number; count: number }>>,
) {
    if (ids.length === 0) return new Map<number, number>();
    return new Map((await loader()).map((row) => [row.key, row.count]));
}

const semesterRoutes: RouteDefinition = {
    async GET() {
        const rows = await db.select().from(semester).orderBy(desc(semester.createdAt));
        const ids = rows.map((row) => row.id);
        const counts = await loadCounts(ids, () =>
            db
                .select({ key: class_.semesterId, count: count() })
                .from(class_)
                .where(inArray(class_.semesterId, ids))
                .groupBy(class_.semesterId),
        );
        return json(rows.map((row) => ({ ...row, classCount: counts.get(row.id) ?? 0 })));
    },

    async POST(req) {
        const body = await parseBody<{ name?: string; setAsCurrent?: boolean }>(req);
        const name = stringValue(body.name).trim();
        if (!name || name.length > 20) return error("学期名称须为1-20个字符", "VALIDATION_ERROR");
        if (body.setAsCurrent !== undefined && typeof body.setAsCurrent !== "boolean") {
            return error("当前学期标记无效", "VALIDATION_ERROR");
        }
        if ((await db.select({ id: semester.id }).from(semester).where(eq(semester.name, name))).length > 0) {
            return error("学期名称已存在", "DUPLICATE_NAME", 409);
        }

        const id = await db.transaction(async (tx) => {
            if (body.setAsCurrent) await tx.update(semester).set({ isCurrent: 0, updatedAt: new Date() });
            const [created] = await tx
                .insert(semester)
                .values({ name, isCurrent: body.setAsCurrent ? 1 : 0 })
                .returning({ id: semester.id });
            return created!.id;
        });
        return json({ id }, 201);
    },
};

const semesterCurrentRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        if (!id) return error("无效的学期ID", "INVALID_ID");
        const [row] = await db.select({ id: semester.id }).from(semester).where(eq(semester.id, id));
        if (!row) return error("学期不存在", "NOT_FOUND", 404);
        await db.transaction(async (tx) => {
            await tx.update(semester).set({ isCurrent: 0, updatedAt: new Date() });
            await tx.update(semester).set({ isCurrent: 1, updatedAt: new Date() }).where(eq(semester.id, id));
        });
        return json({ success: true });
    },
};

const semesterDeleteRoutes: RouteDefinition = {
    async DELETE(req) {
        const id = parseId(req);
        if (!id) return error("无效的学期ID", "INVALID_ID");
        const [row] = await db.select().from(semester).where(eq(semester.id, id));
        if (!row) return error("学期不存在", "NOT_FOUND", 404);
        if (row.isCurrent === 1) return error("当前学期不能删除", "CURRENT_SEMESTER_PROTECTED");
        const [classes] = await db.select({ count: count() }).from(class_).where(eq(class_.semesterId, id));
        if ((classes?.count ?? 0) > 0) return error("该学期下有班级，无法删除", "HAS_CLASSES");
        await db.delete(semester).where(eq(semester.id, id));
        return json({ success: true });
    },
};

const teacherRoutes: RouteDefinition = {
    async GET(req) {
        const search = (getSearchParams(req).get("search") ?? "").trim().slice(0, 100);
        const conditions = search
            ? or(
                  ilike(teacher.employeeId, `%${escapeLike(search)}%`),
                  ilike(teacher.name, `%${escapeLike(search)}%`),
              )
            : undefined;
        const rows = await db
            .select({
                id: teacher.id,
                employeeId: teacher.employeeId,
                name: teacher.name,
                status: teacher.status,
                createdAt: teacher.createdAt,
            })
            .from(teacher)
            .where(conditions)
            .orderBy(desc(teacher.createdAt));
        const ids = rows.map((row) => row.id);
        const classCounts = await loadCounts(ids, () =>
            db
                .select({ key: class_.teacherId, count: count() })
                .from(class_)
                .where(inArray(class_.teacherId, ids))
                .groupBy(class_.teacherId),
        );
        return json(rows.map((row) => ({ ...row, classCount: classCounts.get(row.id) ?? 0 })));
    },

    async POST(req) {
        const body = await parseBody<{ employeeId?: string; name?: string }>(req);
        const employeeId = stringValue(body.employeeId).trim();
        const name = stringValue(body.name).trim();
        if (!employeeId || !name || employeeId.length > 50 || name.length > 100) {
            return error("教师工号或姓名无效", "VALIDATION_ERROR");
        }
        if ((await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.employeeId, employeeId))).length > 0) {
            return error("教师工号已存在", "DUPLICATE_ID", 409);
        }
        const [created] = await db
            .insert(teacher)
            .values({ employeeId, name, password: await Bun.password.hash(employeeId), isFirstLogin: 1 })
            .returning({ id: teacher.id });
        return json({ id: created!.id }, 201);
    },
};

const teacherUpdateRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        const body = await parseBody<{ name?: string }>(req);
        const name = stringValue(body.name).trim();
        if (!id) return error("无效的教师ID", "INVALID_ID");
        if (!name || name.length > 100) return error("教师姓名无效", "VALIDATION_ERROR");
        const updated = await db
            .update(teacher)
            .set({ name, updatedAt: new Date() })
            .where(eq(teacher.id, id))
            .returning({ id: teacher.id });
        return updated.length ? json({ success: true }) : error("教师不存在", "NOT_FOUND", 404);
    },
};

const teacherStatusRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        const body = await parseBody<{ status?: number }>(req);
        if (!id || (body.status !== 0 && body.status !== 1)) return error("无效的教师状态", "VALIDATION_ERROR");
        const updated = await db
            .update(teacher)
            .set({ status: body.status, updatedAt: new Date() })
            .where(eq(teacher.id, id))
            .returning({ id: teacher.id });
        if (!updated.length) return error("教师不存在", "NOT_FOUND", 404);
        if (body.status === 0) await clearUserSessionsForUser(TEACHER_USER_TYPE, id);
        return json({ success: true });
    },
};

const teacherResetPasswordRoutes: RouteDefinition = {
    async POST(req) {
        const id = parseId(req);
        if (!id) return error("无效的教师ID", "INVALID_ID");
        const [row] = await db.select().from(teacher).where(eq(teacher.id, id));
        if (!row) return error("教师不存在", "NOT_FOUND", 404);
        await db
            .update(teacher)
            .set({ password: await Bun.password.hash(row.employeeId), isFirstLogin: 1, loginFailCount: 0, lockedUntil: null, updatedAt: new Date() })
            .where(eq(teacher.id, id));
        await clearUserSessionsForUser(TEACHER_USER_TYPE, id);
        return json({ success: true });
    },
};

const classRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const semesterId = Number.parseInt(params.get("semester_id") ?? "", 10);
        const teacherId = Number.parseInt(params.get("teacher_id") ?? "", 10);
        const conditions = [];
        if (semesterId > 0) conditions.push(eq(class_.semesterId, semesterId));
        if (teacherId > 0) conditions.push(eq(class_.teacherId, teacherId));
        const rows = await db
            .select({
                id: class_.id,
                name: class_.name,
                semesterId: class_.semesterId,
                semesterName: semester.name,
                teacherId: class_.teacherId,
                teacherName: teacher.name,
                createdAt: class_.createdAt,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(teacher, eq(class_.teacherId, teacher.id))
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(class_.createdAt));
        const ids = rows.map((row) => row.id);
        const studentCounts = await loadCounts(ids, () =>
            db
                .select({ key: student.classId, count: count() })
                .from(student)
                .where(and(inArray(student.classId, ids), isNull(student.deletedAt)))
                .groupBy(student.classId),
        );
        return json(rows.map((row) => ({ ...row, studentCount: studentCounts.get(row.id) ?? 0 })));
    },

    async POST(req) {
        const body = await parseBody<{ name?: string; semesterId?: number; teacherId?: number }>(req);
        const name = stringValue(body.name).trim();
        if (
            !name
            || name.length > 100
            || typeof body.semesterId !== "number"
            || !Number.isInteger(body.semesterId)
            || body.semesterId <= 0
            || typeof body.teacherId !== "number"
            || !Number.isInteger(body.teacherId)
            || body.teacherId <= 0
        ) {
            return error("班级名称须为1-100个字符，且必须选择有效的学期和教师", "VALIDATION_ERROR");
        }
        const [validSemester] = await db.select({ id: semester.id }).from(semester).where(eq(semester.id, body.semesterId));
        const [validTeacher] = await db.select({ id: teacher.id }).from(teacher).where(and(eq(teacher.id, body.teacherId), eq(teacher.status, 1)));
        if (!validSemester || !validTeacher) return error("学期或教师不存在", "NOT_FOUND", 404);
        const [created] = await db
            .insert(class_)
            .values({ name, semesterId: body.semesterId, teacherId: body.teacherId })
            .returning({ id: class_.id });
        return json({ id: created!.id }, 201);
    },
};

const classUpdateRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        const body = await parseBody<{ name?: string; teacherId?: number }>(req);
        if (!id) return error("无效的班级ID", "INVALID_ID");
        const updates: { name?: string; teacherId?: number; updatedAt: Date } = { updatedAt: new Date() };
        if (body.name !== undefined) {
            const name = stringValue(body.name).trim();
            if (!name || name.length > 100) return error("班级名称须为1-100个字符", "VALIDATION_ERROR");
            updates.name = name;
        }
        if (body.teacherId !== undefined) {
            if (!Number.isInteger(body.teacherId) || body.teacherId <= 0) return error("教师ID无效", "VALIDATION_ERROR");
            const [validTeacher] = await db.select({ id: teacher.id }).from(teacher).where(and(eq(teacher.id, body.teacherId), eq(teacher.status, 1)));
            if (!validTeacher) return error("教师不存在", "NOT_FOUND", 404);
            updates.teacherId = body.teacherId;
        }
        const updated = await db.update(class_).set(updates).where(eq(class_.id, id)).returning({ id: class_.id });
        return updated.length ? json({ success: true }) : error("班级不存在", "NOT_FOUND", 404);
    },

    async DELETE(req) {
        const id = parseId(req);
        if (!id) return error("无效的班级ID", "INVALID_ID");
        const [students] = await db
            .select({ count: count() })
            .from(student)
            .where(eq(student.classId, id));
        const [tasks] = await db.select({ count: count() }).from(task).where(eq(task.classId, id));
        if ((students?.count ?? 0) > 0 || (tasks?.count ?? 0) > 0) {
            return error("班级已有学生或任务，无法删除", "CLASS_IN_USE", 409);
        }
        const removed = await db.delete(class_).where(eq(class_.id, id)).returning({ id: class_.id });
        return removed.length ? json({ success: true }) : error("班级不存在", "NOT_FOUND", 404);
    },
};

const studentRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const classId = Number.parseInt(params.get("class_id") ?? "", 10);
        const search = (params.get("search") ?? "").trim().slice(0, 100);
        const conditions = [isNull(student.deletedAt)];
        if (classId > 0) conditions.push(eq(student.classId, classId));
        if (search) {
            conditions.push(
                or(
                    ilike(student.studentId, `%${escapeLike(search)}%`),
                    ilike(student.name, `%${escapeLike(search)}%`),
                )!,
            );
        }
        const rows = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                classId: student.classId,
                className: class_.name,
                status: student.status,
                createdAt: student.createdAt,
            })
            .from(student)
            .leftJoin(class_, eq(student.classId, class_.id))
            .where(and(...conditions))
            .orderBy(desc(student.createdAt));
        const ids = rows.map((row) => row.id);
        const experimentRows = ids.length
            ? await db
                  .select({
                      studentId: experiment.studentId,
                      currentStage: experiment.currentStage,
                      status: experiment.status,
                      stage4CompletedAt: experiment.stage4CompletedAt,
                  })
                  .from(experiment)
                  .where(inArray(experiment.studentId, ids))
            : [];
        const progress = new Map<number, number>();
        for (const item of experimentRows) {
            const value = experimentProgress(item);
            progress.set(item.studentId, Math.max(progress.get(item.studentId) ?? 0, value));
        }
        return json(rows.map((row) => ({ ...row, progress: progress.get(row.id) ?? 0 })));
    },
};

const studentExperimentsRoutes: RouteDefinition = {
    async GET(req) {
        const id = parseId(req);
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const rows = await db
            .select({
                id: experiment.id,
                taskName: topic.name,
                currentStage: experiment.currentStage,
                status: experiment.status,
                stage4CompletedAt: experiment.stage4CompletedAt,
                submitTime: experiment.submittedAt,
                score: experiment.totalScore,
                lastUpdate: experiment.updatedAt,
            })
            .from(experiment)
            .leftJoin(task, eq(experiment.taskId, task.id))
            .leftJoin(topic, eq(task.topicId, topic.id))
            .where(eq(experiment.studentId, id))
            .orderBy(desc(experiment.updatedAt));
        return json(
            rows.map((row) => ({
                ...row,
                score: row.score == null ? null : Number(row.score),
                progress: experimentProgress(row),
                statusText: {
                    in_progress: "进行中",
                    submitted: "已提交",
                    graded: "已批改",
                    rejected: "已驳回",
                }[row.status],
            })),
        );
    },
};

const studentStatusRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        const body = await parseBody<{ status?: number }>(req);
        if (!id || (body.status !== 0 && body.status !== 1)) return error("无效的学生状态", "VALIDATION_ERROR");
        const updated = await db
            .update(student)
            .set({ status: body.status, updatedAt: new Date() })
            .where(and(eq(student.id, id), isNull(student.deletedAt)))
            .returning({ id: student.id });
        if (!updated.length) return error("学生不存在", "NOT_FOUND", 404);
        if (body.status === 0) await clearUserSessionsForUser(STUDENT_USER_TYPE, id);
        return json({ success: true });
    },
};

const studentResetPasswordRoutes: RouteDefinition = {
    async POST(req) {
        const id = parseId(req);
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const [row] = await db.select().from(student).where(and(eq(student.id, id), isNull(student.deletedAt)));
        if (!row) return error("学生不存在", "NOT_FOUND", 404);
        await db
            .update(student)
            .set({ password: await Bun.password.hash(row.studentId), isFirstLogin: 1, loginFailCount: 0, lockedUntil: null, updatedAt: new Date() })
            .where(eq(student.id, id));
        await clearUserSessionsForUser(STUDENT_USER_TYPE, id);
        return json({ success: true });
    },
};

const announcementRoutes: RouteDefinition = {
    async GET() {
        return json(await db.select().from(announcement).orderBy(desc(announcement.createdAt)));
    },

    async POST(req) {
        const body = await parseBody<{ title?: string; content?: string; publish?: boolean; targetScope?: string }>(req);
        const title = stringValue(body.title).trim();
        const content = stringValue(body.content).trim();
        const targetScope = body.targetScope ?? "all";
        if (!title || title.length > 100 || !content || content.length > 10_000) {
            return error("公告标题或内容无效", "VALIDATION_ERROR");
        }
        if (body.publish !== undefined && typeof body.publish !== "boolean") {
            return error("公告发布状态无效", "VALIDATION_ERROR");
        }
        if (!(["all", "teacher", "student"] as const).includes(targetScope as "all" | "teacher" | "student")) {
            return error("公告目标范围无效", "VALIDATION_ERROR");
        }
        const [created] = await db
            .insert(announcement)
            .values({ title, content, targetScope, status: body.publish ? 1 : 0 })
            .returning({ id: announcement.id });
        return json({ id: created!.id }, 201);
    },
};

const announcementUpdateRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseId(req);
        const body = await parseBody<{ title?: string; content?: string; targetScope?: string; status?: number }>(req);
        if (!id) return error("无效的公告ID", "INVALID_ID");
        const updates: { title?: string; content?: string; targetScope?: string; status?: number; updatedAt: Date } = { updatedAt: new Date() };
        if (body.title !== undefined) {
            const title = stringValue(body.title).trim();
            if (!title || title.length > 100) return error("公告标题无效", "VALIDATION_ERROR");
            updates.title = title;
        }
        if (body.content !== undefined) {
            const content = stringValue(body.content).trim();
            if (!content || content.length > 10_000) return error("公告内容无效", "VALIDATION_ERROR");
            updates.content = content;
        }
        if (body.targetScope !== undefined) {
            if (!(["all", "teacher", "student"] as const).includes(body.targetScope as "all" | "teacher" | "student")) {
                return error("公告目标范围无效", "VALIDATION_ERROR");
            }
            updates.targetScope = body.targetScope;
        }
        if (body.status !== undefined) {
            if (body.status !== 0 && body.status !== 1) return error("公告状态无效", "VALIDATION_ERROR");
            updates.status = body.status;
        }
        const changed = await db
            .update(announcement)
            .set(updates)
            .where(eq(announcement.id, id))
            .returning({ id: announcement.id });
        return changed.length ? json({ success: true }) : error("公告不存在", "NOT_FOUND", 404);
    },

    async DELETE(req) {
        const id = parseId(req);
        if (!id) return error("无效的公告ID", "INVALID_ID");
        const removed = await db.delete(announcement).where(eq(announcement.id, id)).returning({ id: announcement.id });
        return removed.length ? json({ success: true }) : error("公告不存在", "NOT_FOUND", 404);
    },
};

function makeAnnouncementStatusRoute(status: 0 | 1): RouteDefinition {
    return {
        async PUT(req) {
            const id = parseId(req);
            if (!id) return error("无效的公告ID", "INVALID_ID");
            const changed = await db
                .update(announcement)
                .set({ status, updatedAt: new Date() })
                .where(eq(announcement.id, id))
                .returning({ id: announcement.id });
            return changed.length ? json({ success: true }) : error("公告不存在", "NOT_FOUND", 404);
        },
    };
}

const announcementPublishRoutes = makeAnnouncementStatusRoute(1);
const announcementUnpublishRoutes = makeAnnouncementStatusRoute(0);

export {
    announcementPublishRoutes,
    announcementRoutes,
    announcementUnpublishRoutes,
    announcementUpdateRoutes,
    classRoutes,
    classUpdateRoutes,
    semesterCurrentRoutes,
    semesterDeleteRoutes,
    semesterRoutes,
    studentExperimentsRoutes,
    studentResetPasswordRoutes,
    studentRoutes,
    studentStatusRoutes,
    teacherResetPasswordRoutes,
    teacherRoutes,
    teacherStatusRoutes,
    teacherUpdateRoutes,
};
