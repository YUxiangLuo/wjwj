import { expect, test } from "bun:test";
import { buildTaskProgressSnapshot } from "./task-progress";

test("buildTaskProgressSnapshot classifies student progress states", () => {
    const result = buildTaskProgressSnapshot([
        {
            studentId: "20230001",
            name: "Alice",
            experimentId: null,
            currentStage: null,
            experimentStatus: null,
            latestSubmission: null,
            lastActivity: null,
        },
        {
            studentId: "20230002",
            name: "Bob",
            experimentId: 11,
            currentStage: 2,
            experimentStatus: 0,
            latestSubmission: null,
            lastActivity: new Date("2026-03-01T00:00:00.000Z"),
        },
        {
            studentId: "20230003",
            name: "Carol",
            experimentId: 12,
            currentStage: 4,
            experimentStatus: 1,
            latestSubmission: "100,1",
            lastActivity: new Date("2026-03-02T00:00:00.000Z"),
        },
        {
            studentId: "20230004",
            name: "Dave",
            experimentId: 13,
            currentStage: 4,
            experimentStatus: 1,
            latestSubmission: "101,2",
            lastActivity: new Date("2026-03-03T00:00:00.000Z"),
        },
        {
            studentId: "20230005",
            name: "Eve",
            experimentId: 14,
            currentStage: 4,
            experimentStatus: 1,
            latestSubmission: "102,3",
            lastActivity: new Date("2026-03-04T00:00:00.000Z"),
        },
    ]);

    expect(result.counts).toEqual({
        not_started: 1,
        stage1: 0,
        stage2: 1,
        stage3: 0,
        stage4: 0,
        submitted: 1,
        graded: 1,
        rejected: 1,
    });
    expect(result.students.map((student) => student.status)).toEqual([
        "not_started",
        "stage2",
        "submitted",
        "graded",
        "rejected",
    ]);
});
