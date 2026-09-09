import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, samplingAttempt, semester, student, userSession } from "../../db/schema";
import { isValidOptionalEmail } from "../../lib/email";
import { parseSpreadsheetFile, spreadsheetRequestExceedsLimit, validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { hashPassword, mapWithConcurrency } from "../../server/password-work";
import { deleteAuditEventsForActor, deleteAuditEventsForEntities } from "../../server/audit-event";
import { error, getPositiveRouteId, json, parseBody, parseFormData, stringValue } from "../../server/http";
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

// Passing a transaction holds ownership until the mutation commits.
async function requireOwnedClass(classId: number, teacherId: number, tx?: Pick<typeof db, "select">) {
    const query = (tx ?? db)
        .select({ id: class_.id })
        .from(class_)
        .where(and(eq(class_.id, classId), eq(class_.teacherId, teacherId)));
    const [row] = await (tx ? query.for("share") : query);
    return row ?? null;
}

async function findOwnedStudent(id: number, teacherId: number, tx?: Pick<typeof db, "select">) {
    const query = (tx ?? db)
        .select({ id: student.id, studentId: student.studentId, status: student.status })
        .from(student)
        .innerJoin(class_, eq(student.classId, class_.id))
        .where(and(eq(student.id, id), eq(class_.teacherId, teacherId)));
    const [row] = await (tx ? query.for("update") : query);
    return row ?? null;
}

export async function deleteTeacherStudent(params: { teacherId: number; studentId: number }) {
    return db.transaction(async (tx) => {
        const owned = await findOwnedStudent(params.studentId, params.teacherId, tx);
        if (!owned) return false;
        const experimentRows = await tx
            .select({ id: experiment.id })
            .from(experiment)
            .where(eq(experiment.studentId, params.studentId));
        const experimentIds = experimentRows.map((row) => row.id);
        const attemptRows = experimentIds.length
            ? await tx
                .select({ id: samplingAttempt.id })
                .from(samplingAttempt)
                .where(inArray(samplingAttempt.experimentId, experimentIds))
            : [];
        await tx.delete(student).where(eq(student.id, params.studentId));
        await deleteAuditEventsForEntities(tx, "sampling_attempt", attemptRows.map((row) => row.id));
        await deleteAuditEventsForEntities(tx, "experiment", experimentIds);
        await deleteAuditEventsForEntities(tx, "student", [params.studentId]);
        await deleteAuditEventsForActor(tx, "student", params.studentId);
        await tx.delete(userSession).where(and(
            eq(userSession.userType, STUDENT_USER_TYPE),
            eq(userSession.userId, params.studentId),
        ));
        return true;
    });
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
            .leftJoin(student, eq(student.classId, class_.id))
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
                .where(eq(student.classId, classId))
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
        const [existing] = await db.select({ id: student.id }).from(student).where(eq(student.studentId, studentId));
        if (existing) return error("学号已存在", "DUPLICATE_ERROR", 409);
        const password = await hashPassword(studentId);
        const created = await db.transaction(async (tx) => {
            if (!(await requireOwnedClass(classId, teacherId, tx))) return false;
            await tx.insert(student).values({ studentId, name, email: email || null, classId, password });
            return true;
        });
        return created ? json({ success: true }, 201) : error("无权限访问该班级", "FORBIDDEN", 403);
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

        const formData = await parseFormData(req);
        const file = formData.get("file");
        if (!(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);
        const fileError = validateSpreadsheetUploadFile(file);
        if (fileError) return error(fileError.message, fileError.code, fileError.status);

        let rows: Array<Record<string, unknown>>;
        let rowNumbers: number[] | undefined;
        try {
            const buffer = await file.arrayBuffer();
            const parsedFile = await parseSpreadsheetFile(buffer, file.name, { includeColumnValues: false });
            if (parsedFile.malformed) return error("表格行列结构不一致或引号未闭合", "INVALID_FILE", 400);
            rows = parsedFile.rows;
            rowNumbers = parsedFile.rowNumbers;
        } catch {
            return error("无法读取表格文件", "INVALID_FILE", 400);
        }

        if (rows.length === 0) return error("文件内容为空", "VALIDATION_ERROR", 400);
        if (rows.length > MAX_IMPORT_ROWS) return error(`单次导入最多${MAX_IMPORT_ROWS}行`, "VALIDATION_ERROR", 400);

        const errors: Array<{ row: number; reason: string }> = [];
        const seenIds = new Set<string>();
        const parsed = rows.flatMap((row, index) => {
            const rowNumber = rowNumbers?.[index] ?? index + 2;
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
                  .select({ studentId: student.studentId })
                  .from(student)
                  .where(sql`${student.studentId} IN (${sql.join(candidates.map((item) => item.studentId), sql`, `)})`)
            : [];
        const existingIds = new Set(existing.map((item) => normalizeStudentId(item.studentId)));
        for (const item of candidates) {
            if (existingIds.has(item.normalizedStudentId)) {
                errors.push({ row: item.row, reason: `学号已存在: ${item.studentId}` });
            }
        }
        const inserts = candidates.filter((item) => !existingIds.has(item.normalizedStudentId));
        const hashes = await mapWithConcurrency(inserts, 4, (item) => hashPassword(item.studentId));
        if (inserts.length) {
            const created = await db.transaction(async (tx) => {
                if (!(await requireOwnedClass(classId, teacherId, tx))) return false;
                await tx.insert(student).values(inserts.map((item, index) => ({
                    studentId: item.studentId,
                    name: item.name,
                    email: item.email,
                    classId,
                    password: hashes[index]!,
                })));
                return true;
            });
            if (!created) return error("无权限访问该班级", "FORBIDDEN", 403);
        }
        return json({
            successCount: inserts.length,
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
        const owned = await findOwnedStudent(id, teacherId);
        if (!owned) return error("无权限操作该学生", "FORBIDDEN", 403);

        const body = await parseBody<{ action?: "reset_password" | "toggle_status" }>(req);
        if (body.action !== "reset_password" && body.action !== "toggle_status") {
            return error("无效的操作", "VALIDATION_ERROR");
        }
        // Slow password work stays outside the short ownership/write transaction.
        const password = body.action === "reset_password" ? await hashPassword(owned.studentId) : null;
        const changed = await db.transaction(async (tx) => {
            const current = await findOwnedStudent(id, teacherId, tx);
            if (!current) return false;
            if (password !== null) {
                await tx.update(student).set({ password, updatedAt: new Date() }).where(eq(student.id, id));
                await clearUserSessionsForUser(STUDENT_USER_TYPE, id, tx);
            } else {
                const status = current.status === 1 ? 0 : 1;
                await tx.update(student).set({ status, updatedAt: new Date() }).where(eq(student.id, id));
                if (status === 0) await clearUserSessionsForUser(STUDENT_USER_TYPE, id, tx);
            }
            return true;
        });
        return changed ? json({ success: true }) : error("无权限操作该学生", "FORBIDDEN", 403);
    },

    async DELETE(req) {
        const id = parseRouteId(req, "id");
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const removed = await deleteTeacherStudent({ teacherId, studentId: id });
        if (!removed) return error("无权限操作该学生", "FORBIDDEN", 403);
        return json({ success: true });
    },
};

export { classRoutes, classStudentsImportRoutes, classStudentsRoutes, studentRoutes };
