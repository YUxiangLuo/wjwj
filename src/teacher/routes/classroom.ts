import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, samplingAttempt, semester, student, userSession } from "../../db/schema";
import { isValidOptionalEmail } from "../../lib/email";
import { parseSpreadsheetFile, spreadsheetRequestExceedsLimit, validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { hashPassword, mapWithConcurrency } from "../../server/password-work";
import { deleteAuditEventsForActor, deleteAuditEventsForEntities, hashEntityIdentifier, writeAuditEvent } from "../../server/audit-event";
import { error, getPositiveRouteId, getSearchParams, json, parseBody, parseFormData, parsePagination, stringValue } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { clearUserSessionsForUser } from "../../server/user-session";
import { STUDENT_USER_TYPE } from "../../student/routes/auth";
import { getPrimaryTeacherIdOrThrow } from "./auth";
import {
    deletionRequiresConfirmation,
    loadDeletionImpact,
    type DeletionImpact,
} from "../deletion-impact";

const MAX_IMPORT_ROWS = 500;
const MAX_STUDENT_ID_LENGTH = 50;
const MAX_STUDENT_NAME_LENGTH = 100;
const MAX_STUDENT_EMAIL_LENGTH = 120;

/** Escape LIKE wildcards so a roster search cannot turn into a pattern. */
function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

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
        .select({ id: student.id, studentId: student.studentId, classId: student.classId })
        .from(student)
        .innerJoin(class_, eq(student.classId, class_.id))
        .where(and(eq(student.id, id), eq(class_.teacherId, teacherId)));
    const [row] = await (tx ? query.for("update") : query);
    return row ?? null;
}

type ImportCandidate = {
    studentId: string;
    normalizedStudentId: string;
    name: string;
    email: string | null;
    row: number;
};

/**
 * A student ID is unique across the whole table, so an account that already owns
 * the ID decides whether an import inserts, skips or rejects the row.
 */
type ExistingStudentAccount = {
    id: number;
    studentId: string;
    classId: number;
    className: string;
    teacherId: number;
};

async function loadExistingStudentAccounts(studentIds: string[]) {
    const accounts = new Map<string, ExistingStudentAccount>();
    if (!studentIds.length) return accounts;
    const rows = await db
        .select({
            id: student.id,
            studentId: student.studentId,
            classId: student.classId,
            className: class_.name,
            teacherId: class_.teacherId,
        })
        .from(student)
        .innerJoin(class_, eq(student.classId, class_.id))
        .where(inArray(student.studentId, studentIds));
    for (const row of rows) accounts.set(normalizeStudentId(row.studentId), row);
    return accounts;
}

/** Reason to reject a student ID, or null when it belongs to this class already. */
function describeStudentConflict(
    account: ExistingStudentAccount,
    classId: number,
    teacherId: number,
): string | null {
    if (account.teacherId !== teacherId) return "学号已被其他教师的班级使用，请先让对方教师从名单中删除该学生";
    if (account.classId === classId) return null;
    return `学号已存在于班级「${account.className}」，如需变更班级请先在该班级删除该学生`;
}

export type StudentDeletionResult =
    | { ok: true }
    | { ok: false; code: "NOT_FOUND" }
    | { ok: false; code: "SUBMISSIONS_EXIST"; impact: DeletionImpact };

/** Counts what a hard delete would cascade away, before anything is removed. */
export async function getStudentDeletionImpact(params: { teacherId: number; studentId: number }) {
    return db.transaction(async (tx) => {
        const owned = await findOwnedStudent(params.studentId, params.teacherId, tx);
        if (!owned) return null;
        return loadDeletionImpact(tx, eq(experiment.studentId, params.studentId));
    });
}

export async function deleteTeacherStudent(params: {
    teacherId: number;
    studentId: number;
    confirm?: boolean;
}): Promise<StudentDeletionResult> {
    return db.transaction(async (tx) => {
        const owned = await findOwnedStudent(params.studentId, params.teacherId, tx);
        if (!owned) return { ok: false, code: "NOT_FOUND" };
        // The guard runs against the same locked row set as the delete, so a
        // submission cannot land between the check and the cascade.
        const impact = await loadDeletionImpact(tx, eq(experiment.studentId, params.studentId));
        if (!params.confirm && deletionRequiresConfirmation(impact)) {
            return { ok: false, code: "SUBMISSIONS_EXIST", impact };
        }
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
        // The student's own trail is gone by now; keep one de-identified record of
        // the deletion itself so the action is still accountable.
        await writeAuditEvent(tx, {
            actorType: "teacher",
            actorId: params.teacherId,
            action: "student.deleted",
            entityType: "student",
            entityId: params.studentId,
            details: {
                classId: owned.classId,
                studentIdHash: hashEntityIdentifier(owned.studentId),
                experiments: impact.experiments,
                submitted: impact.submitted,
                graded: impact.graded,
            },
        });
        return { ok: true };
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
        return json(rows.map((row) => ({ ...row, studentCount: Number(row.studentCount) })));
    },
};

const classStudentsRoutes: RouteDefinition = {
    async GET(req) {
        const classId = parseRouteId(req, "classId");
        if (!classId) return error("无效的班级ID", "INVALID_ID");
        if (!(await requireOwnedClass(classId, getPrimaryTeacherIdOrThrow(req)))) {
            return error("无权限访问该班级", "FORBIDDEN", 403);
        }
        const params = getSearchParams(req);
        const search = (params.get("search") ?? "").trim().slice(0, 100);
        const conditions = [eq(student.classId, classId)];
        if (search) {
            conditions.push(or(
                ilike(student.studentId, `%${escapeLike(search)}%`),
                ilike(student.name, `%${escapeLike(search)}%`),
                ilike(student.email, `%${escapeLike(search)}%`),
            )!);
        }
        const baseQuery = db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                email: student.email,
            })
            .from(student)
            .where(and(...conditions))
            .orderBy(student.studentId);
        // Roster pages paginate once the caller asks for it; the legacy array
        // response stays for small classes and existing callers.
        if (!params.has("page") && !params.has("pageSize")) {
            return json(await baseQuery);
        }
        const pagination = parsePagination(params);
        if (!pagination) return error("分页参数无效", "INVALID_PARAM", 400);
        const { page, pageSize, offset } = pagination;
        const [items, [totalRow]] = await Promise.all([
            baseQuery.limit(pageSize).offset(offset),
            db.select({ count: count() }).from(student).where(and(...conditions)),
        ]);
        return json({ items, total: Number(totalRow?.count ?? 0), page, pageSize });
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
        const account = (await loadExistingStudentAccounts([studentId])).get(normalizeStudentId(studentId));
        if (account) {
            return error(
                describeStudentConflict(account, classId, teacherId) ?? "学号已存在",
                "DUPLICATE_ERROR",
                409,
            );
        }
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
        const parsed: ImportCandidate[] = rows.flatMap((row, index) => {
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
        const skipped: Array<{ row: number; reason: string }> = [];
        const inserts: ImportCandidate[] = [];
        const existingAccounts = await loadExistingStudentAccounts(candidates.map((item) => item.studentId));
        for (const item of candidates) {
            const account = existingAccounts.get(item.normalizedStudentId);
            if (!account) {
                inserts.push(item);
                continue;
            }
            const conflict = describeStudentConflict(account, classId, teacherId);
            if (conflict) {
                errors.push({ row: item.row, reason: conflict });
                continue;
            }
            skipped.push({ row: item.row, reason: `学号已存在，未做变更: ${item.studentId}` });
        }
        errors.sort((a, b) => a.row - b.row);
        // Slow password work stays outside the transaction.
        const hashes = await mapWithConcurrency(inserts, 4, (item) => hashPassword(item.studentId));

        let insertedIds = new Set<string>();
        if (inserts.length) {
            const applied = await db.transaction(async (tx) => {
                if (!(await requireOwnedClass(classId, teacherId, tx))) return null;
                // A concurrent import may claim a student ID first; DO NOTHING keeps
                // the batch atomic and reports those rows per row below instead of
                // aborting the whole file with a unique-constraint error.
                const created = await tx
                    .insert(student)
                    .values(inserts.map((item, index) => ({
                        studentId: item.studentId,
                        name: item.name,
                        email: item.email,
                        classId,
                        password: hashes[index]!,
                    })))
                    .onConflictDoNothing({ target: student.studentId })
                    .returning({ studentId: student.studentId });
                return new Set(created.map((row) => normalizeStudentId(row.studentId)));
            });
            if (!applied) return error("无权限访问该班级", "FORBIDDEN", 403);
            insertedIds = applied;

            const lost = inserts.filter((item) => !insertedIds.has(item.normalizedStudentId));
            if (lost.length) {
                const accounts = await loadExistingStudentAccounts(lost.map((item) => item.studentId));
                for (const item of lost) {
                    const account = accounts.get(item.normalizedStudentId);
                    if (!account) {
                        errors.push({ row: item.row, reason: `学号已存在: ${item.studentId}` });
                        continue;
                    }
                    const conflict = describeStudentConflict(account, classId, teacherId);
                    if (conflict) {
                        errors.push({ row: item.row, reason: conflict });
                        continue;
                    }
                    skipped.push({ row: item.row, reason: `学号已存在，未做变更: ${item.studentId}` });
                }
                errors.sort((a, b) => a.row - b.row);
            }
        }
        return json({
            successCount: insertedIds.size,
            skippedCount: skipped.length,
            failureCount: errors.length,
            errors,
            skipped,
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

        const body = await parseBody<{ action?: "reset_password" }>(req);
        if (body.action !== "reset_password") return error("无效的操作", "VALIDATION_ERROR");
        // Slow password work stays outside the short ownership/write transaction.
        const password = await hashPassword(owned.studentId);
        const changed = await db.transaction(async (tx) => {
            const current = await findOwnedStudent(id, teacherId, tx);
            if (!current) return false;
            await tx.update(student).set({ password, updatedAt: new Date() }).where(eq(student.id, id));
            await clearUserSessionsForUser(STUDENT_USER_TYPE, id, tx);
            return true;
        });
        return changed ? json({ success: true }) : error("无权限操作该学生", "FORBIDDEN", 403);
    },

    async DELETE(req) {
        const id = parseRouteId(req, "id");
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const confirm = getSearchParams(req).get("confirm") === "1";
        const removed = await deleteTeacherStudent({ teacherId, studentId: id, confirm });
        if (!removed.ok) {
            if (removed.code === "SUBMISSIONS_EXIST") {
                return error(
                    `该学生存在 ${removed.impact.submitted + removed.impact.graded} 条已提交或已批改的实验记录，永久删除会一并清除；确认后请重试`,
                    "SUBMISSIONS_EXIST",
                    409,
                );
            }
            return error("无权限操作该学生", "FORBIDDEN", 403);
        }
        return json({ success: true });
    },
};

const studentDeletionPreviewRoutes: RouteDefinition = {
    async GET(req) {
        const id = parseRouteId(req, "id");
        if (!id) return error("无效的学生ID", "INVALID_ID");
        const impact = await getStudentDeletionImpact({
            teacherId: getPrimaryTeacherIdOrThrow(req),
            studentId: id,
        });
        if (!impact) return error("无权限操作该学生", "FORBIDDEN", 403);
        return json({ impact, requiresConfirmation: deletionRequiresConfirmation(impact) });
    },
};

export { classRoutes, classStudentsImportRoutes, classStudentsRoutes, studentDeletionPreviewRoutes, studentRoutes };
