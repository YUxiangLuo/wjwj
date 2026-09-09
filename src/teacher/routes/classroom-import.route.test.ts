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
        const { module, operations } = await loadClassroomRoutes({ select: [[{ id: 3 }], [], [{ id: 3 }]] });
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
            [{ id: 42 }],
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
            [{ id: 3 }],
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

test("student hard deletion removes sessions, audit events, and the student row", async () => {
    const { module, operations } = await loadClassroomRoutes({
        teacherId: 9,
        select: [
            [{ id: 44 }],
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
});
