import { expect, mock, test } from "bun:test";
import { student } from "../../db/schema";
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
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        withTeacherAuth: (handler: unknown) => handler,
        withPrimaryTeacherAuth: (handler: unknown) => handler,
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentsByClassIds: async () => undefined,
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
        ASSISTANT_USER_TYPE: 3,
    }));

    const module = await import("./classroom");
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
    expect(insertOperations).toHaveLength(2);
    expect(insertOperations[0]?.values).toMatchObject({
        studentId: "2099201",
        name: "浏览器学生甲",
        email: "qa-import-a@example.com",
        classId: 3,
    });
    expect(insertOperations[1]?.values).toMatchObject({
        studentId: "2099202",
        name: "浏览器学生乙",
        email: "qa-import-b@example.com",
        classId: 3,
    });
});
