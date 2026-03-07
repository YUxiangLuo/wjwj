import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: "sql", strings: [...strings], values }),
    {
        join: (values: unknown[], separator: unknown) => ({ kind: "join", values, separator }),
    }
);

async function loadGradingRoutes(options: {
    select?: unknown[];
    authUser?: { id: number; type: "teacher" | "assistant" } | null;
} = {}) {
    mock.restore();
    const { db, operations } = createMockDb({ select: options.select });

    mock.module("drizzle-orm", () => ({
        and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
        desc: (value: unknown) => ({ kind: "desc", value }),
        eq: (left: unknown, right: unknown) => ({ kind: "eq", left, right }),
        sql,
    }));
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getCurrentUser: async () => options.authUser ?? { id: 1, type: "teacher" },
        ASSISTANT_USER_TYPE: 3,
        TEACHER_USER_TYPE: 2,
        isLockExpired: () => true,
        notifyStudentById: async () => undefined,
    }));

    const module = await import("./grading");
    return { module, operations };
}

test("grading list keeps accessible class filter when status filter is applied", async () => {
    const { module, operations } = await loadGradingRoutes({
        select: [
            [{ id: 1 }, { id: 4 }],
            [],
        ],
    });

    const response = await module.gradingRoutes.GET!(
        new Request("https://example.com/api/teacher/grading?status=pending")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: [] });

    const selectOperations = operations.filter((operation) => operation.kind === "select");
    const listQuery = selectOperations[1];
    const where = (listQuery?.where ?? null) as { kind?: string; conditions?: unknown[] } | null;

    expect(where?.kind).toBe("and");
    expect(where?.conditions).toHaveLength(2);
    expect(where?.conditions?.[0]).toMatchObject({ kind: "sql" });
    expect(where?.conditions?.[1]).toMatchObject({ kind: "eq", right: 1 });
});
