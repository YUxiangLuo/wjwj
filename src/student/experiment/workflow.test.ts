import { expect, mock, test } from "bun:test";
import { experiment, student, task } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

test("getOrCreateStudentExperiment returns an existing experiment without opening a write transaction", async () => {
    const existing = { id: 42, studentId: 2, taskId: 3, currentStage: 2, status: "in_progress" };
    const { db, operations } = createMockDb({ select: [[existing]] });
    mock.module("../../db", () => ({ db }));
    const { getOrCreateStudentExperiment } = await import(`./workflow.ts?existing=${crypto.randomUUID()}`);

    const result = await getOrCreateStudentExperiment(2, 3);

    expect(result).toEqual(existing as any);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("select");
});

test("getOrCreateStudentExperiment locks student and task FOR SHARE inside a transaction before inserting", async () => {
    const created = { id: 50, studentId: 2, taskId: 3, currentStage: 1, status: "in_progress" };
    const { db, operations } = createMockDb({
        select: [[], [{ id: 2 }], [{ id: 3 }]],
        insert: [[created]],
    });
    mock.module("../../db", () => ({ db }));
    const { getOrCreateStudentExperiment } = await import(`./workflow.ts?create=${crypto.randomUUID()}`);

    const result = await getOrCreateStudentExperiment(2, 3);

    expect(result).toEqual(created as any);
    expect(operations[0]).toMatchObject({ kind: "select", table: experiment });
    expect(operations[1]?.kind).toBe("transaction");
    expect(operations[2]).toMatchObject({ kind: "select", table: student, lockStrength: "share" });
    expect(operations[3]).toMatchObject({ kind: "select", table: task, lockStrength: "share" });
    expect(operations[4]).toMatchObject({ kind: "insert", table: experiment, onConflictDoNothing: true });
});

test("getOrCreateStudentExperiment returns null without inserting when student or task was concurrently deleted", async () => {
    for (const parentSelects of [[[], [{ id: 3 }]], [[{ id: 2 }], []]]) {
        const { db, operations } = createMockDb({
            select: [[], ...parentSelects],
        });
        mock.module("../../db", () => ({ db }));
        const { getOrCreateStudentExperiment } = await import(`./workflow.ts?deleted=${crypto.randomUUID()}`);

        const result = await getOrCreateStudentExperiment(2, 3);

        expect(result).toBeNull();
        expect(operations.some((op) => op.kind === "insert")).toBe(false);
    }
});
