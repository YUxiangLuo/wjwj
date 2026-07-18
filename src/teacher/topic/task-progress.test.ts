import { expect, test } from "bun:test";
import { buildTaskProgressSnapshot } from "./task-progress";

test("buildTaskProgressSnapshot classifies the single experiment record", () => {
    const result = buildTaskProgressSnapshot([
        { studentId: "S1", name: "Alice", experimentId: null, currentStage: null, experimentStatus: null, lastActivity: null },
        { studentId: "S2", name: "Bob", experimentId: 11, currentStage: 2, experimentStatus: "in_progress", lastActivity: new Date() },
        { studentId: "S3", name: "Carol", experimentId: 12, currentStage: 4, experimentStatus: "submitted", lastActivity: new Date() },
        { studentId: "S4", name: "Dave", experimentId: 13, currentStage: 4, experimentStatus: "graded", lastActivity: new Date() },
        { studentId: "S5", name: "Eve", experimentId: 14, currentStage: 4, experimentStatus: "rejected", lastActivity: new Date() },
    ]);

    expect(result.counts).toEqual({ not_started: 1, stage1: 0, stage2: 1, stage3: 0, stage4: 0, submitted: 1, graded: 1, rejected: 1 });
    expect(result.students.map((student) => student.status)).toEqual(["not_started", "stage2", "submitted", "graded", "rejected"]);
    expect(result.students[2]?.submissionId).toBe(12);
});
