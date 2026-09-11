import { expect, mock, test } from "bun:test";
import { auditEvent, experiment, student, userSession } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, classId: string) {
    (request as Request & { params?: Record<string, string> }).params = { classId };
    return request;
}

function withStudentParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadClassroomRoutes(options: {
    teacherId?: number;
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
        insert: options.insert,
        update: options.update,
        delete: options.delete,
    });

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
    }));

    const module = await import(`./classroom.ts?classroom=${crypto.randomUUID()}`);
    return { module, operations };
}

test("student import preserves Chinese text for utf-8 csv files", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
            [{ id: 3 }],
        ],
        insert: [[{ studentId: "2099201" }, { studentId: "2099202" }]],
    });

    const formData = new FormData();
    formData.append(
        "file",
        new File(
            ["studentId,name,email\n2099201,浏览器学生甲,qa-import-a@example.com\n2099202,浏览器学生乙,qa-import-b@example.com\n"],
            "students.csv",
            { type: "text/csv" }
        )
    );

    const request = withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", {
            method: "POST",
            body: formData,
        }),
        "3"
    );

    const response = await module.classStudentsImportRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
        success: true,
        data: {
            successCount: 2,
            failureCount: 0,
            errors: [],
        },
    });

    const insertOperations = operations.filter((operation) => operation.kind === "insert" && operation.table === student);
    expect(insertOperations).toHaveLength(1);
    expect(insertOperations[0]?.values).toEqual([
        expect.objectContaining({ studentId: "2099201", name: "浏览器学生甲", email: "qa-import-a@example.com", classId: 3 }),
        expect.objectContaining({ studentId: "2099202", name: "浏览器学生乙", email: "qa-import-b@example.com", classId: 3 }),
    ]);
    const inserted = insertOperations[0]?.values as Array<{ studentId: string; password: string }>;
    expect(await Bun.password.verify("2099201", inserted[0]!.password)).toBe(true);
    expect(await Bun.password.verify("2099202", inserted[1]!.password)).toBe(true);
});

for (const quoted of [false, true]) {
    test(`student import skips CSV blank lines and reports original ${quoted ? "multiline quoted" : "unquoted"} row numbers`, async () => {
        const { module, operations } = await loadClassroomRoutes({ select: [[{ id: 3 }], [], [{ id: 3 }]], insert: [[{ studentId: "S01" }]] });
        const formData = new FormData();
        formData.append("file", new File([
            `studentId,name,email\r\nS01,${quoted ? '"学生\r\n甲"' : "学生甲"},ok@example.edu\r\n\r\n,缺号,\r\nS01,重复,\r\n \t\r\nS02,学生乙,bad\r\n,,\r\n\r\n\r\n`,
        ], "students.csv", { type: "text/csv" }));
        const response = await module.classStudentsImportRoutes.POST!(withRouteParam(new Request(
            "https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData },
        ), "3"));
        const payload = await response.json() as any;
        const offset = quoted ? 1 : 0;
        expect(response.status).toBe(200);
        expect(payload.data).toMatchObject({ successCount: 1, failureCount: 4 });
        expect(payload.data.errors).toEqual([
            { row: 4 + offset, reason: "缺少学号或姓名" },
            { row: 5 + offset, reason: "文件中学号重复: S01" },
            { row: 7 + offset, reason: "邮箱格式无效" },
            { row: 8 + offset, reason: "缺少学号或姓名" },
        ]);
        const insert = operations.find(operation => operation.kind === "insert" && operation.table === student);
        expect(insert?.values).toEqual([expect.objectContaining({ studentId: "S01", classId: 3 })]);
    });
}

test("student import treats differently-cased student IDs as duplicates", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
            [{ id: 3 }],
        ],
        insert: [[{ studentId: "S001" }]],
    });
    const formData = new FormData();
    formData.append(
        "file",
        new File(
            ["studentId,name,email\nS001,学生甲,a@example.com\ns001,学生乙,b@example.com\n"],
            "students.csv",
            { type: "text/csv" },
        ),
    );

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(payload.data).toMatchObject({ successCount: 1, failureCount: 1 });
    expect(payload.data.errors).toEqual([{ row: 3, reason: "文件中学号重复: s001" }]);
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === student);
    expect(insert?.values).toEqual([
        expect.objectContaining({ studentId: "S001", name: "学生甲", classId: 3 }),
    ]);
});

test("student import rejects unsupported spreadsheet extensions before parsing", async () => {
    const { module, operations } = await loadClassroomRoutes({ select: [[{ id: 3 }]] });
    const formData = new FormData();
    formData.append("file", new File(["not a workbook"], "students.xls", { type: "application/vnd.ms-excel" }));
    const request = withRouteParam(new Request("https://example.com/api/teacher/classes/3/students/import", {
        method: "POST",
        body: formData,
    }), "3");

    const response = await module.classStudentsImportRoutes.POST!(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_FILE" } });
    expect(operations.some((operation) => operation.kind === "insert" && operation.table === student)).toBe(false);
});

test("single student creation validates database column lengths", async () => {
    const { module, operations } = await loadClassroomRoutes({ select: [[{ id: 3 }]] });
    const request = withRouteParam(new Request("https://example.com/api/teacher/classes/3/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: "S".repeat(51), name: "学生" }),
    }), "3");

    const response = await module.classStudentsRoutes.POST!(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "学号不能超过50个字符" } });
    expect(operations.some((operation) => operation.kind === "insert" && operation.table === student)).toBe(false);
});

test("single student creation rejects a malformed optional email", async () => {
    const { module, operations } = await loadClassroomRoutes({ select: [[{ id: 3 }]] });
    const request = withRouteParam(new Request("https://example.com/api/teacher/classes/3/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: "S009", name: "测试学生", email: "wrong-email" }),
    }), "3");

    const response = await module.classStudentsRoutes.POST!(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "邮箱格式无效" } });
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("single student creation stores the student ID password without restore metadata", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
            [{ id: 3 }],
        ],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "S041", name: "新学生", email: "student@example.edu" }),
        },
    ), "3"));
    const payload = await response.json() as any;

    expect(response.status).toBe(201);
    expect(payload.data).toEqual({ success: true });
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === student);
    expect(insert?.values).toMatchObject({ studentId: "S041", name: "新学生", email: "student@example.edu", classId: 3 });
    expect(await Bun.password.verify("S041", (insert?.values as any).password)).toBe(true);
});

test("single student creation still rejects an active duplicate", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, studentId: "S042", classId: 3, className: "统计一班", teacherId: 9 }],
        ],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "S042", name: "重复学生" }),
        },
    ), "3"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "DUPLICATE_ERROR" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("single student creation names the class that already owns the student ID", async () => {
    const { module } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, studentId: "S042", classId: 7, className: "数据分析班", teacherId: 9 }],
        ],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "S042", name: "张三" }),
        },
    ), "3"));

    expect(response.status).toBe(409);
    const payload = await response.json() as any;
    expect(payload.error.code).toBe("DUPLICATE_ERROR");
    expect(payload.error.message).toContain("数据分析班");
});

test("single student creation does not leak another teacher's class name", async () => {
    const { module } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, studentId: "S042", classId: 7, className: "他人班级", teacherId: 5 }],
        ],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "S042", name: "张三" }),
        },
    ), "3"));

    expect(response.status).toBe(409);
    const payload = await response.json() as any;
    expect(payload.error.message).toContain("其他教师");
    expect(payload.error.message).not.toContain("他人班级");
});

test("student import skips an active duplicate without counting it as a failure", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, studentId: "S042", classId: 3, className: "统计一班", teacherId: 9 }],
        ],
    });
    const formData = new FormData();
    formData.append("file", new File(["studentId,name\nS042,张三\n"], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ successCount: 0, skippedCount: 1, failureCount: 0, errors: [] });
    expect(payload.data.skipped).toEqual([{ row: 2, reason: "学号已存在，未做变更: S042" }]);
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});

test("student import tells the teacher which class blocks the row", async () => {
    const { module } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [
                { id: 42, studentId: "S042", classId: 7, className: "数据分析班", teacherId: 9 },
                { id: 43, studentId: "S043", classId: 8, className: "另一个班级", teacherId: 5 },
            ],
        ],
    });
    const formData = new FormData();
    formData.append("file", new File(["studentId,name\nS042,甲\nS043,乙\n"], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ successCount: 0, failureCount: 2 });
    expect(payload.data.errors[0]).toEqual({ row: 2, reason: "学号已存在于班级「数据分析班」，如需变更班级请先在该班级删除该学生" });
    expect(payload.data.errors[1]).toEqual({ row: 3, reason: "学号已被其他教师的班级使用，请先让对方教师从名单中删除该学生" });
});

test("student import reports and skips malformed optional emails", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
            [{ id: 3 }],
        ],
        insert: [[{ studentId: "S010" }]],
    });
    const formData = new FormData();
    formData.append(
        "file",
        new File(
            ["studentId,name,email\nS009,测试学生,wrong-email\nS010,有效学生,valid@example.edu\n"],
            "students.csv",
            { type: "text/csv" },
        ),
    );

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(payload.data).toMatchObject({ successCount: 1, failureCount: 1 });
    expect(payload.data.errors).toEqual([{ row: 2, reason: "邮箱格式无效" }]);
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === student);
    expect(insert?.values).toEqual([
        expect.objectContaining({ studentId: "S010", email: "valid@example.edu" }),
    ]);
});

test("student hard deletion removes sessions, audit events, and the student row", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44, studentId: "S044", classId: 3 }],
            [{ id: 91 }, { id: 92 }],
        ],
    });
    const response = await module.studentRoutes.DELETE!(withStudentParam(new Request(
        "https://example.com/api/teacher/students/44",
        { method: "DELETE" },
    ), "44"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true } });
    const deletedTables = operations.filter((operation) => operation.kind === "delete").map((operation) => operation.table);
    expect(deletedTables).toContain(auditEvent);
    expect(deletedTables).toContain(userSession);
    expect(deletedTables).toContain(student);
    expect(operations.some((operation) => operation.kind === "select" && operation.table === experiment)).toBe(true);
    expect(operations.some((operation) => operation.kind === "update" && operation.table === student)).toBe(false);
    // The student's own trail is cleared, but the deletion itself is accountable.
    const audit = operations.find((operation) => operation.kind === "insert" && operation.table === auditEvent);
    expect(audit?.values).toMatchObject({ action: "student.deleted", actorType: "teacher", actorId: 9, entityType: "student", entityId: 44 });
    const details = (audit?.values as { details?: Record<string, unknown> })?.details ?? {};
    expect(Object.keys(details)).toEqual(expect.arrayContaining(["classId", "studentIdHash", "experiments"]));
    expect(JSON.stringify(details)).not.toContain("S044");
    expect(audit?.values).not.toHaveProperty("studentId");
});

test("student import reports a lost insert race per row instead of failing the file", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
            [{ id: 3 }],
            // Re-read after the insert lost the race for both rows.
            [
                { id: 42, studentId: "S042", classId: 3, className: "统计一班", teacherId: 9 },
                { id: 43, studentId: "S043", classId: 7, className: "数据分析班", teacherId: 9 },
            ],
        ],
        insert: [[]],
    });
    const formData = new FormData();
    formData.append("file", new File(["studentId,name\nS042,甲\nS043,乙\n"], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ successCount: 0, skippedCount: 1, failureCount: 1 });
    expect(payload.data.skipped).toEqual([{ row: 2, reason: "学号已存在，未做变更: S042" }]);
    expect(payload.data.errors).toEqual([{ row: 3, reason: "学号已存在于班级「数据分析班」，如需变更班级请先在该班级删除该学生" }]);
    // The batch must not abort on the unique constraint.
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === student);
    expect(insert?.onConflictDoNothing).toBe(true);
    // Only the skipped row was re-read; the conflicting class came from the same probe.
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(4);
});

test("student deletion preview reports the cascade and whether confirmation is required", async () => {
    const { module } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44 }],
            [{ status: "submitted", count: 1 }, { status: "graded", count: 2 }, { status: "in_progress", count: 4 }],
        ],
    });
    const response = await module.studentDeletionPreviewRoutes.GET!(withStudentParam(new Request(
        "https://example.com/api/teacher/students/44/deletion-preview",
    ), "44"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: {
            impact: { experiments: 7, submitted: 1, graded: 2 },
            requiresConfirmation: true,
        },
    });
});

test("student deletion refuses to cascade graded work without an explicit confirmation", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44, studentId: "S044", classId: 3 }],
            [{ status: "graded", count: 2 }],
        ],
    });
    const response = await module.studentRoutes.DELETE!(withStudentParam(new Request(
        "https://example.com/api/teacher/students/44",
        { method: "DELETE" },
    ), "44"));

    expect(response.status).toBe(409);
    const payload = await response.json() as any;
    expect(payload.error.code).toBe("SUBMISSIONS_EXIST");
    expect(payload.error.message).toContain("2 条");
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});

test("student deletion with confirmation removes the graded work", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44, studentId: "S044", classId: 3 }],
            [{ status: "graded", count: 1 }],
            [{ id: 91 }],
        ],
    });
    const response = await module.studentRoutes.DELETE!(withStudentParam(new Request(
        "https://example.com/api/teacher/students/44?confirm=1",
        { method: "DELETE" },
    ), "44"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true } });
    expect(operations.some((operation) => operation.kind === "delete" && operation.table === student)).toBe(true);
});

test("student deletion of an unsubmitted roster entry stays a one-step delete", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44, studentId: "S044", classId: 3 }],
            [{ status: "in_progress", count: 1 }],
            [],
        ],
    });
    const response = await module.studentRoutes.DELETE!(withStudentParam(new Request(
        "https://example.com/api/teacher/students/44",
        { method: "DELETE" },
    ), "44"));

    expect(response.status).toBe(200);
    expect(operations.some((operation) => operation.kind === "delete" && operation.table === student)).toBe(true);
});

test("student import treats full-width digits as the same student ID", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, studentId: "S2601", classId: 3, className: "统计一班", teacherId: 9 }],
        ],
    });
    const formData = new FormData();
    formData.append("file", new File(["studentId,name\nＳ2601,全角林清\n"], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    // Full-width input must not fork a second, visually identical account.
    expect(payload.data).toMatchObject({ successCount: 0, skippedCount: 1, failureCount: 0 });
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("student creation stores the normalized form of a full-width student ID", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [[{ id: 3 }], [], [{ id: 3 }]],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "　２６０１ ", name: "全角学生" }),
        },
    ), "3"));

    expect(response.status).toBe(201);
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === student);
    expect(insert?.values).toMatchObject({ studentId: "2601", name: "全角学生" });
});
