import { expect, mock, test } from "bun:test";
import { student } from "../../db/schema";
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
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
        insert: options.insert,
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
    expect(payload).toEqual({
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
        expect.objectContaining({ studentId: "2099201", name: "浏览器学生甲", email: "qa-import-a@example.com", classId: 3, isFirstLogin: 1 }),
        expect.objectContaining({ studentId: "2099202", name: "浏览器学生乙", email: "qa-import-b@example.com", classId: 3, isFirstLogin: 1 }),
    ]);
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
        expect.objectContaining({ studentId: "S001", name: "学生甲", classId: 3, isFirstLogin: 1 }),
    ]);
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
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});
