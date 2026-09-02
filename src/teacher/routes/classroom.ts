import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, semester, student } from "../../db/schema";
import { isValidOptionalEmail } from "../../lib/email";
import { parseSpreadsheetFile, spreadsheetRequestExceedsLimit, validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { hashPassword, mapWithConcurrency } from "../../server/password-work";
import { writeAuditEvent } from "../../server/audit-event";
import { error, getPositiveRouteId, json, parseBody, stringValue } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { clearUserSessionsForUser } from "../../server/user-session";
import { STUDENT_USER_TYPE } from "../../student/routes/auth";
import { getPrimaryTeacherIdOrThrow } from "./auth";

const MAX_IMPORT_ROWS = 500;
const MAX_STUDENT_ID_LENGTH = 50;
const MAX_STUDENT_NAME_LENGTH = 100;
const MAX_STUDENT_EMAIL_LENGTH = 120;

function normalizeStudentId(value: string) {
    return value.toLocaleLowerCase("en-US");
}

function parseRouteId(req: Request, name: string) {
    return getPositiveRouteId(req, name);
}

async function requireOwnedClass(classId: number, teacherId: number) {
    const [row] = await db
        .select({ id: class_.id })
        .from(class_)
        .where(and(eq(class_.id, classId), eq(class_.teacherId, teacherId)));
    return row ?? null;
}

const classRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
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
            .where(eq(class_.teacherId, teacherId))
            .groupBy(class_.id, semester.id)
            .orderBy(desc(class_.createdAt));
        return json(rows);
    },
};

const classStudentsRoutes: RouteDefinition = {
    async GET(req) {
        const classId = parseRouteId(req, "classId");
        if (!classId) return error("无效的班级ID", "INVALID_ID");
        if (!(await requireOwnedClass(classId, getPrimaryTeacherIdOrThrow(req)))) {
            return error("无权限访问该班级", "FORBIDDEN", 403);
        }
        return json(
            await db
                .select({
                    id: student.id,
                    studentId: student.studentId,
                    name: student.name,
                    email: student.email,
                    status: student.status,
                })
                .from(student)
                .where(and(eq(student.classId, classId), isNull(student.deletedAt)))
                .orderBy(student.studentId),
        );
    },

    async POST(req) {
        const classId = parseRouteId(req, "classId");
        if (!classId) return error("无效的班级ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        if (!(await requireOwnedClass(classId, teacherId))) {
            return error("无权限访问该班级", "FORBIDDEN", 403);
        }
        const body = await parseBody<{ studentId?: string; name?: string; email?: string }>(req);
        if (body.email !== undefined && typeof body.email !== "string") {
            return error("邮箱格式无效", "VALIDATION_ERROR");
        }
        const studentId = stringValue(body.studentId).trim();
        const name = stringValue(body.name).trim();
        const email = stringValue(body.email).trim();
        if (!studentId || !name) return error("学号和姓名不能为空", "VALIDATION_ERROR");
        if (studentId.length > MAX_STUDENT_ID_LENGTH) return error("学号不能超过50个字符", "VALIDATION_ERROR");
        if (name.length > MAX_STUDENT_NAME_LENGTH) return error("姓名不能超过100个字符", "VALIDATION_ERROR");
        if (email.length > MAX_STUDENT_EMAIL_LENGTH) return error("邮箱不能超过120个字符", "VALIDATION_ERROR");
        if (!isValidOptionalEmail(email)) return error("邮箱格式无效", "VALIDATION_ERROR");
        const [existing] = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                deletedAt: student.deletedAt,
                previousClassId: student.classId,
                teacherId: class_.teacherId,
            })
            .from(student)
            .innerJoin(class_, eq(student.classId, class_.id))
            .where(eq(student.studentId, studentId));
        if (existing) {
            if (!existing.deletedAt) return error("学号已存在", "DUPLICATE_ERROR", 409);
            if (existing.teacherId !== teacherId) {
                return error("该学号属于其他教师管理的历史记录，请联系管理员恢复", "STUDENT_RESTORE_FORBIDDEN", 409);
            }
            const password = await hashPassword(existing.studentId);
            const restored = await db.transaction(async (tx) => {
                const [updated] = await tx
                    .update(student)
                    .set({
                        name,
                        email: email || null,
                        classId,
                        password,
                        status: 1,
                        deletedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(student.id, existing.id), isNotNull(student.deletedAt)))
                    .returning({ id: student.id });
                if (!updated) return false;
                await writeAuditEvent(tx, {
                    actorType: "teacher",
                    actorId: teacherId,
                    action: "student.restored",
                    entityType: "student",
                    entityId: existing.id,
                    details: { source: "single", previousClassId: existing.previousClassId, classId },
                });
                return true;
            });
            if (!restored) return error("学生记录状态已变化，请刷新后重试", "STUDENT_RESTORE_CONFLICT", 409);
            await clearUserSessionsForUser(STUDENT_USER_TYPE, existing.id);
            return json({ success: true, restored: true });
        }
        await db.insert(student).values({
            studentId,
            name,
            email: email || null,
            classId,
            password: await hashPassword(studentId),
        });
        return json({ success: true, restored: false }, 201);
    },
};

const classStudentsImportRoutes: RouteDefinition = {
    async POST(req) {
        const classId = parseRouteId(req, "classId");
        if (!classId) return error("无效的班级ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        if (!(await requireOwnedClass(classId, teacherId))) {
            return error("无权限访问该班级", "FORBIDDEN", 403);
        }
        if (spreadsheetRequestExceedsLimit(req)) {
            return error("表格文件不能超过20 MiB", "FILE_TOO_LARGE", 413);
        }

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);
        const fileError = validateSpreadsheetUploadFile(file);
        if (fileError) return error(fileError.message, fileError.code, fileError.status);

        let rows: Array<Record<string, unknown>>;
        try {
            const buffer = await file.arrayBuffer();
            const parsedFile = await parseSpreadsheetFile(buffer, file.name, { includeColumnValues: false });
            if (parsedFile.malformed) return error("表格行列结构不一致或引号未闭合", "INVALID_FILE", 400);
            rows = parsedFile.rows;
        } catch {
            return error("无法读取表格文件", "INVALID_FILE", 400);
        }

        if (rows.length === 0) return error("文件内容为空", "VALIDATION_ERROR", 400);
        if (rows.length > MAX_IMPORT_ROWS) return error(`单次导入最多${MAX_IMPORT_ROWS}行`, "VALIDATION_ERROR", 400);

        const errors: Array<{ row: number; reason: string }> = [];
        const seenIds = new Set<string>();
        const parsed = rows.flatMap((row, index) => {
            const rowNumber = index + 2;
            const studentId = String(row.studentId ?? row["学号"] ?? row.id ?? "").trim();
            const name = String(row.name ?? row["姓名"] ?? "").trim();
            const email = String(row.email ?? row["邮箱"] ?? "").trim();
            if (!studentId || !name) {
                errors.push({ row: rowNumber, reason: "缺少学号或姓名" });
                return [];
            }
            if (studentId.length > MAX_STUDENT_ID_LENGTH) {
                errors.push({ row: rowNumber, reason: "学号不能超过50个字符" });
                return [];
            }
            if (name.length > MAX_STUDENT_NAME_LENGTH) {
                errors.push({ row: rowNumber, reason: "姓名不能超过100个字符" });
                return [];
            }
            if (email.length > MAX_STUDENT_EMAIL_LENGTH) {
                errors.push({ row: rowNumber, reason: "邮箱不能超过120个字符" });
                return [];
            }
            if (!isValidOptionalEmail(email)) {
                errors.push({ row: rowNumber, reason: "邮箱格式无效" });
                return [];
            }
            const normalizedStudentId = normalizeStudentId(studentId);
            if (seenIds.has(normalizedStudentId)) {
                errors.push({ row: rowNumber, reason: `文件中学号重复: ${studentId}` });
                return [];
            }
            seenIds.add(normalizedStudentId);
            return [{ studentId, normalizedStudentId, name, email: email || null, row: rowNumber }];
        });

        const candidates = parsed;
        const existing = candidates.length
            ? await db
                  .select({
                      id: student.id,
                      studentId: student.studentId,
                      deletedAt: student.deletedAt,
                      previousClassId: student.classId,
                      teacherId: class_.teacherId,
                  })
                  .from(student)
                  .innerJoin(class_, eq(student.classId, class_.id))
                  .where(sql`${student.studentId} IN (${sql.join(candidates.map((item) => item.studentId), sql`, `)})`)
            : [];
        const existingById = new Map(existing.map((item) => [normalizeStudentId(item.studentId), item]));
        const newStudents: typeof candidates = [];
        const studentsToRestore: Array<typeof candidates[number] & {
            existingId: number;
            previousClassId: number;
            storedStudentId: string;
        }> = [];
        for (const item of candidates) {
            const matching = existingById.get(item.normalizedStudentId);
            if (!matching) {
                newStudents.push(item);
            } else if (!matching.deletedAt) {
                errors.push({ row: item.row, reason: `学号已存在: ${item.studentId}` });
            } else if (matching.teacherId !== teacherId) {
                errors.push({ row: item.row, reason: `学号属于其他教师管理的历史记录，请联系管理员恢复: ${item.studentId}` });
            } else {
                studentsToRestore.push({
                    ...item,
                    existingId: matching.id,
                    previousClassId: matching.previousClassId,
                    storedStudentId: matching.studentId,
                });
            }
        }
        const passwordSources = [
            ...newStudents.map((item) => ({ ...item, passwordStudentId: item.studentId })),
            ...studentsToRestore.map((item) => ({ ...item, passwordStudentId: item.storedStudentId })),
        ];
        const hashes = await mapWithConcurrency(passwordSources, 4, (item) => hashPassword(item.passwordStudentId));
        const passwordByStudentId = new Map(passwordSources.map((item, index) => [
            item.normalizedStudentId,
            hashes[index]!,
        ]));
        const successfullyRestoredIds = new Set<string>();

        await db.transaction(async (tx) => {
            for (const item of studentsToRestore) {
                const [restored] = await tx
                    .update(student)
                    .set({
                        name: item.name,
                        email: item.email,
                        classId,
                        password: passwordByStudentId.get(item.normalizedStudentId)!,
                        status: 1,
                        deletedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(student.id, item.existingId), isNotNull(student.deletedAt)))
                    .returning({ id: student.id });
                if (!restored) {
                    errors.push({ row: item.row, reason: `学生记录状态已变化，请重试: ${item.studentId}` });
                    continue;
                }
                successfullyRestoredIds.add(item.normalizedStudentId);
                await writeAuditEvent(tx, {
                    actorType: "teacher",
                    actorId: teacherId,
                    action: "student.restored",
                    entityType: "student",
                    entityId: item.existingId,
                    details: { source: "import", previousClassId: item.previousClassId, classId },
                });
            }
            if (newStudents.length) {
                await tx.insert(student).values(
                    newStudents.map((item) => ({
                        studentId: item.studentId,
                        name: item.name,
                        email: item.email,
                        classId,
                        password: passwordByStudentId.get(item.normalizedStudentId)!,
                    })),
                );
            }
        });
        const restoredStudents = studentsToRestore
            .filter((item) => successfullyRestoredIds.has(item.normalizedStudentId));
        await mapWithConcurrency(restoredStudents, 8, (item) => (
            clearUserSessionsForUser(STUDENT_USER_TYPE, item.existingId)
        ));

        const restoredCount = successfullyRestoredIds.size;
        return json({
            successCount: newStudents.length + restoredCount,
            restoredCount,
            failureCount: errors.length,
            errors,
        });
    },
};

const studentRoutes: RouteDefinition = {
    async PUT(req) {
        const id = parseRouteId(req, "id");
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const [owned] = await db
            .select({ id: student.id, studentId: student.studentId, status: student.status })
            .from(student)
            .innerJoin(class_, eq(student.classId, class_.id))
            .where(and(eq(student.id, id), eq(class_.teacherId, teacherId), isNull(student.deletedAt)));
        if (!owned) return error("无权限操作该学生", "FORBIDDEN", 403);

        const body = await parseBody<{ action?: "reset_password" | "toggle_status" }>(req);
        if (body.action === "reset_password") {
            await db
                .update(student)
                .set({ password: await hashPassword(owned.studentId), updatedAt: new Date() })
                .where(eq(student.id, id));
            await clearUserSessionsForUser(STUDENT_USER_TYPE, id);
            return json({ success: true });
        } else if (body.action === "toggle_status") {
            const status = owned.status === 1 ? 0 : 1;
            await db.update(student).set({ status, updatedAt: new Date() }).where(eq(student.id, id));
            if (status === 0) await clearUserSessionsForUser(STUDENT_USER_TYPE, id);
        } else {
            return error("无效的操作", "VALIDATION_ERROR");
        }
        return json({ success: true });
    },

    async DELETE(req) {
        const id = parseRouteId(req, "id");
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const [owned] = await db
            .select({ id: student.id })
            .from(student)
            .innerJoin(class_, eq(student.classId, class_.id))
            .where(and(eq(student.id, id), eq(class_.teacherId, teacherId), isNull(student.deletedAt)));
        if (!owned) return error("无权限操作该学生", "FORBIDDEN", 403);
        await db.update(student).set({ deletedAt: new Date(), status: 0, updatedAt: new Date() }).where(eq(student.id, id));
        await clearUserSessionsForUser(STUDENT_USER_TYPE, id);
        return json({ success: true });
    },
};

export { classRoutes, classStudentsImportRoutes, classStudentsRoutes, studentRoutes };
