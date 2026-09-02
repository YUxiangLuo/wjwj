import { expect, mock, test } from "bun:test";
import { auditEvent, student } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, classId: string) {
    (request as Request & { params?: Record<string, string> }).params = { classId };
    return request;
}

async function loadClassroomRoutes(options: {
    teacherId?: number;
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
        insert: options.insert,
        update: options.update,
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
        ],
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
            restoredCount: 0,
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

test("student import treats differently-cased student IDs as duplicates", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
        ],
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

test("single student creation restores a soft-deleted record instead of violating the unique student ID", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 3 }],
            [{ id: 41, studentId: "S041", deletedAt: new Date(), previousClassId: 2, teacherId: 9 }],
        ],
        update: [[{ id: 41 }]],
    });
    const response = await module.classStudentsRoutes.POST!(withRouteParam(new Request(
        "https://example.com/api/teacher/classes/3/students",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "s041", name: "恢复学生", email: "restored@example.edu" }),
        },
    ), "3"));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ success: true, restored: true });
    expect(operations.some((operation) => operation.kind === "insert" && operation.table === student)).toBe(false);
    const update = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(update?.set).toMatchObject({
        name: "恢复学生",
        email: "restored@example.edu",
        classId: 3,
        status: 1,
        deletedAt: null,
    });
    expect(await Bun.password.verify("S041", (update?.set as any).password)).toBe(true);
    expect(await Bun.password.verify("s041", (update?.set as any).password)).toBe(false);
});

test("single student creation still rejects an active duplicate", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [{ id: 42, deletedAt: null, previousClassId: 3, teacherId: 9 }],
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

test("student import reports and skips malformed optional emails", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [
            [{ id: 3 }],
            [],
        ],
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

test("student import restores a soft-deleted student owned by the same teacher", async () => {
    const deletedAt = new Date("2026-09-01T00:00:00Z");
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 3 }],
            [{ id: 44, studentId: "S009", deletedAt, previousClassId: 2, teacherId: 9 }],
        ],
        update: [[{ id: 44 }]],
    });
    const formData = new FormData();
    formData.append("file", new File([
        "studentId,name,email\ns009,恢复学生,restored@example.edu\n",
    ], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(payload.data).toMatchObject({
        successCount: 1,
        restoredCount: 1,
        failureCount: 0,
    });
    expect(operations.some((operation) => operation.kind === "insert" && operation.table === student)).toBe(false);
    const update = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(update?.set).toMatchObject({
        name: "恢复学生",
        email: "restored@example.edu",
        classId: 3,
        status: 1,
        deletedAt: null,
    });
    expect(await Bun.password.verify("S009", (update?.set as any).password)).toBe(true);
    expect(await Bun.password.verify("s009", (update?.set as any).password)).toBe(false);
    const audit = operations.find((operation) => operation.kind === "insert" && operation.table === auditEvent);
    expect(audit?.values).toMatchObject({
        actorType: "teacher",
        actorId: 9,
        action: "student.restored",
        entityType: "student",
        entityId: 44,
        details: { source: "import", previousClassId: 2, classId: 3 },
    });
});

test("student import cannot restore a soft-deleted student owned by another teacher", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 3 }],
            [{ id: 45, studentId: "S010", deletedAt: new Date(), teacherId: 10 }],
        ],
    });
    const formData = new FormData();
    formData.append("file", new File([
        "studentId,name,email\nS010,其他教师学生,other@example.edu\n",
    ], "students.csv", { type: "text/csv" }));

    const response = await module.classStudentsImportRoutes.POST!(withRouteParam(
        new Request("https://example.com/api/teacher/classes/3/students/import", { method: "POST", body: formData }),
        "3",
    ));
    const payload = await response.json() as any;

    expect(payload.data).toMatchObject({ successCount: 0, restoredCount: 0, failureCount: 1 });
    expect(payload.data.errors[0].reason).toContain("其他教师");
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});
