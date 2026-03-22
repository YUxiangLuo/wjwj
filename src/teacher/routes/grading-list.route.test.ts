import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: "sql", strings: [...strings], values }),
    {
        join: (values: unknown[], separator: unknown) => ({ kind: "join", values, separator }),
    }
);

// Pre-load the real drizzle-orm so internal deps (mysql-core) resolve correctly
const realDrizzle = await import("drizzle-orm");

async function loadGradingRoutes(options: {
    select?: unknown[];
    authUser?: { id: number; type: "teacher" | "assistant" } | null;
} = {}) {
    mock.restore();
    const { db, operations } = createMockDb({ select: options.select });

    mock.module("drizzle-orm", () => ({
        ...realDrizzle,
        and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
        count: () => ({ kind: "count" }),
        desc: (value: unknown) => ({ kind: "desc", value }),
        eq: (left: unknown, right: unknown) => ({ kind: "eq", left, right }),
        like: (col: unknown, pattern: unknown) => ({ kind: "like", col, pattern }),
        or: (...conditions: unknown[]) => ({ kind: "or", conditions }),
        isNull: (col: unknown) => ({ kind: "isNull", col }),
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
            [{ id: 1 }, { id: 4 }],   // getAccessibleClassIds
            [{ count: 0 }],            // count query
            [],                         // data query
        ],
    });

    const response = await module.gradingRoutes.GET!(
        new Request("https://example.com/api/teacher/grading?status=pending")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } });

    const selectOperations = operations.filter((operation) => operation.kind === "select");
    // selectOperations[0] = class IDs, [1] = count, [2] = data
    const listQuery = selectOperations[2];
    const where = (listQuery?.where ?? null) as { kind?: string; conditions?: unknown[] } | null;

    expect(where?.kind).toBe("and");
    expect(where?.conditions).toHaveLength(5);
    expect(where?.conditions?.[0]).toMatchObject({ kind: "sql" });
    expect(where?.conditions?.[1]).toMatchObject({ kind: "isNull" });
    expect(where?.conditions?.[2]).toMatchObject({ kind: "eq" });
    expect(where?.conditions?.[3]).toMatchObject({ kind: "isNull" });
    expect(where?.conditions?.[4]).toMatchObject({ kind: "or" });
});
