import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("submission pdf job payload prefers immutable submission snapshots", async () => {
    const { db } = createMockDb({
        select: [[{
            submissionId: 501,
            studentDbId: 11,
            studentIdText: "20230001",
            currentStudentName: "当前学生名",
            teacherId: 21,
            currentTopicName: "当前课题名",
            submittedAt: new Date("2026-03-08T08:00:00.000Z"),
            snapshotQuestionnaire: {
                title: "提交时问卷",
                welcomeText: "欢迎语",
                endingText: "结束语",
                questions: [{ type: "single", content: "快照题目", options: ["A", "B"] }],
            },
            snapshotReportContent: "提交时实验报告",
            snapshotTopicName: "提交时课题名",
            snapshotStudentName: "提交时学生名",
        }]],
    });

    mock.restore();
    mock.module("../../db", () => ({ db }));

    const module = await import(`./submission-pdf.ts?case=${Date.now()}`);
    const payload = await module.loadSubmissionPdfJobPayload(501);

    expect(payload).toMatchObject({
        submissionId: 501,
        studentDbId: 11,
        studentIdText: "20230001",
        studentName: "提交时学生名",
        teacherId: 21,
        topicName: "提交时课题名",
        reportContent: "提交时实验报告",
        questionnaire: {
            title: "提交时问卷",
            questions: [{ type: "single", content: "快照题目", options: ["A", "B"] }],
        },
    });
});
