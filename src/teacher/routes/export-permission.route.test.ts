import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: "sql", strings: [...strings], values }),
    {
        join: (values: unknown[], separator: unknown) => ({ kind: "join", values, separator }),
    }
);

async function loadExportRoutes(options: { select?: unknown[]; teacherId?: number } = {}) {
    mock.restore();
    const { db, operations } = createMockDb({ select: options.select });

    mock.module("drizzle-orm", () => ({
        and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
        count: (value?: unknown) => ({ kind: "count", value }),
        eq: (left: unknown, right: unknown) => ({ kind: "eq", left, right }),
        isNull: (value: unknown) => ({ kind: "isNull", value }),
        sql,
    }));
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 1,
    }));

    const module = await import("./export");
    return { module, operations };
}

test("grade export preview keeps teacher ownership filter when class filter is applied", async () => {
    const { module, operations } = await loadExportRoutes({ select: [[]] });

    const response = await module.gradeExportPreviewRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/preview?classId=2")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: [] });

    const selectOperation = operations.find((operation) => operation.kind === "select");
    const where = (selectOperation?.where ?? null) as { kind?: string; conditions?: unknown[] } | null;

    expect(where?.kind).toBe("and");
    expect(where?.conditions).toHaveLength(2);
    expect(where?.conditions?.[0]).toMatchObject({ kind: "eq", right: 1 });
    expect(where?.conditions?.[1]).toMatchObject({ kind: "eq", right: 2 });
});

test("grade export data keeps teacher ownership filter when class filter is applied", async () => {
    const { module, operations } = await loadExportRoutes({ select: [[]] });

    const response = await module.gradeExportDataRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/data?classId=2")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: [] });

    const selectOperation = operations.find((operation) => operation.kind === "select");
    const where = (selectOperation?.where ?? null) as { kind?: string; conditions?: unknown[] } | null;

    expect(where?.kind).toBe("and");
    expect(where?.conditions).toHaveLength(2);
    expect(where?.conditions?.[0]).toMatchObject({ kind: "eq", right: 1 });
    expect(where?.conditions?.[1]).toMatchObject({ kind: "eq", right: 2 });
});

test("grade export preview rejects invalid numeric filters", async () => {
    const { module, operations } = await loadExportRoutes();

    const response = await module.gradeExportPreviewRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/preview?classId=abc")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "INVALID_PARAM",
            message: "查询参数无效",
        },
    });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(0);
});
