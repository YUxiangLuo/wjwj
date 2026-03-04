import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { assistant, assistantClass, class_, experiment, loginLog, semester, student, submission, task } from "../../db/schema";
import { error, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { ASSISTANT_USER_TYPE, getCurrentTeacherId } from "./auth";

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
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(class_.id)
            .orderBy(desc(class_.createdAt));

        return json(rows);
    }
};

const classStudentsRoutes: RouteDefinition = {
    async GET(req) {
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

        const rows = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                status: student.status,
                lastLogin: sql<string>`(select max(login_at) from login_log where user_id = ${student.id} and user_type = 2)`,
            })
            .from(student)
            .where(and(eq(student.classId, classId), isNull(student.deletedAt)));

        return json(rows);
    },

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

        const body = await parseBody<{ studentId: string; name: string; email?: string }>(req);
        if (!body.studentId || !body.name) return error("Missing required fields", "VALIDATION_ERROR");

        const [exist] = await db.select().from(student).where(eq(student.studentId, body.studentId));
        if (exist) return error("Student ID already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(student).values({
            studentId: body.studentId,
            name: body.name,
            classId,
            password: defaultPassword,
            status: 1,
            isFirstLogin: 1,
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
            const rowIndex = index + 2;
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
            .where(sql`${student.studentId} IN (${sql.join(toInsert.map((s) => s.studentId), sql`, `)})`);

        const existingSet = new Set(existing.map((e) => e.studentId));
        const finalInsert = toInsert.filter((item) => !existingSet.has(item.studentId));

        existingSet.forEach((id) => {
            errors.push({ row: -1, reason: `学号已存在: ${id}` });
        });

        const defaultPassword = await Bun.password.hash("123456");

        await db.transaction(async (tx) => {
            for (const item of finalInsert) {
                await tx.insert(student).values({
                    studentId: item.studentId,
                    name: item.name,
                    classId,
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

        const assistants = await db
            .select({
                id: assistant.id,
                account: assistant.account,
                name: assistant.name,
                status: assistant.status,
            })
            .from(assistant)
            .where(eq(assistant.creatorTeacherId, currentTeacherId));

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
                studentId: ast.account,
                email: "",
                assignedClasses: classes.map((c) => c.name),
                assignedClassIds: classes.map((c) => c.id),
                status: ast.status,
                lastLogin: lastLogin?.lastLogin ?? null,
            };
        }));

        return json(results);
    },

    async POST(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const body = await parseBody<{ name: string; studentId: string }>(req);

        if (!body.name || !body.studentId) return error("Missing fields", "VALIDATION_ERROR");

        const [exist] = await db.select().from(assistant).where(eq(assistant.account, body.studentId));
        if (exist) return error("Account already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(assistant).values({
            name: body.name,
            account: body.studentId,
            password: defaultPassword,
            creatorTeacherId: currentTeacherId,
            status: 1,
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

        const [ast] = await db.select({ name: assistant.name }).from(assistant).where(eq(assistant.id, id));
        const newName = ast?.name?.includes("已删除") ? ast.name : `${ast?.name ?? "助教"}(已删除)`;
        await db.update(assistant).set({ status: 0, name: newName }).where(eq(assistant.id, id));

        return json({ success: true });
    }
};

const assistantClassAssignRoutes: RouteDefinition = {
    async POST(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const assistantId = Number(parts[4]);

        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [owned] = await db
            .select({ id: assistant.id })
            .from(assistant)
            .where(and(eq(assistant.id, assistantId), eq(assistant.creatorTeacherId, currentTeacherId)));

        if (!owned) return error("无权限操作该助教", "FORBIDDEN", 403);

        const body = await parseBody<{ classIds: number[]; force?: boolean }>(req);

        const existing = await db.select({ classId: assistantClass.classId }).from(assistantClass).where(eq(assistantClass.assistantId, assistantId));

        const existingIds = new Set(existing.map((c) => c.classId));
        const nextIds = new Set(body.classIds ?? []);
        const removed = [...existingIds].filter((id) => !nextIds.has(id));

        if (removed.length > 0 && !body.force) {
            const [drafts] = await db
                .select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .where(and(eq(submission.status, 0), eq(submission.gradedByType, ASSISTANT_USER_TYPE), eq(submission.gradedById, assistantId), sql`${task.classId} IN (${sql.join(removed, sql`, `)})`));

            if ((drafts?.count ?? 0) > 0) {
                return error("该助教在移除班级存在批改草稿，继续将保留草稿但无法继续批改。", "HAS_DRAFTS", 409);
            }
        }

        await db.transaction(async (tx) => {
            await tx.delete(assistantClass).where(eq(assistantClass.assistantId, assistantId));

            if (body.classIds && body.classIds.length > 0) {
                for (const classId of body.classIds) {
                    await tx.insert(assistantClass).values({
                        assistantId,
                        classId,
                    });
                }
            }
        });

        return json({ success: true });
    }
};

export {
    assistantClassAssignRoutes,
    assistantItemRoutes,
    assistantRoutes,
    classRoutes,
    classStudentsImportRoutes,
    classStudentsRoutes,
    studentRoutes,
};
