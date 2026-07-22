import { expect, mock, test } from "bun:test";
import { experiment } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

test("a new experiment starts at the first completable stage", async () => {
    const { db, operations } = createMockDb({
        select: [[]],
        insert: [[{ id: 9, studentId: 2, taskId: 3, currentStage: 1, status: "in_progress" }]],
    });
    mock.module("../../db", () => ({ db }));
    const { getOrCreateStudentExperiment } = await import(`./workflow.ts?stage=${crypto.randomUUID()}`);

    const result = await getOrCreateStudentExperiment(2, 3);
    expect(result).toMatchObject({ currentStage: 1, status: "in_progress" });
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === experiment);
    expect(insert?.values).toMatchObject({ studentId: 2, taskId: 3, currentStage: 1 });
});
