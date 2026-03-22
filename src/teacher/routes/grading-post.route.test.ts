import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

const detailRowBase = {
    id: 99,
    lockedById: null as number | null,
    lockedByType: null as number | null,
    lockedAt: null as Date | null,
    experimentId: 10,
    topicId: 7,
    studentId: 20,
    topicName: "测试课题",
};

async function loadGradingModule(options: {
    select?: unknown[];
    update?: unknown[];
    authUser?: { id: number; type: "teacher" | "assistant" };
} = {}) {
    mock.restore();
    const notifyCalls: Array<{ type: string; title: string; content: string }> = [];
    const { db, operations } = createMockDb({
        select: options.select ?? [],
        update: options.update ?? [],
    });

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getCurrentUser: async () => options.authUser ?? { id: 1, type: "teacher" },
        ASSISTANT_USER_TYPE: 3,
        TEACHER_USER_TYPE: 2,
        isLockExpired: () => true,
        notifyStudentById: async (_studentId: number, payload: { type: string; title: string; content: string }) => {
            notifyCalls.push(payload);
        },
    }));

    const module = await import("./grading");
    return { module, operations, notifyCalls };
}

function postGradingRequest(id: string, body: Record<string, unknown>) {
    return withRouteParam(
        new Request(`https://example.com/api/teacher/grading/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        id
    );
}

test("grading POST re-grade updates scores and notifies GRADE_UPDATED", async () => {
    const { module, operations, notifyCalls } = await loadGradingModule({
        select: [
            [{ id: 1 }],
            [{ ...detailRowBase, status: 2 }],
            [{ weightConfig: { questionnaire: 30, process: 30, report: 40 } }],
        ],
    });

    const response = await module.gradingDetailRoutes.POST!(
        postGradingRequest("99", {
            scoreQuestionnaire: 80,
            scoreProcess: 80,
            scoreReport: 80,
            totalScore: 80,
            comment: "更新后的评语",
            status: 2,
        })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success?: boolean };
    expect(payload.success).toBe(true);

    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]!.type).toBe("GRADE_UPDATED");
    expect(notifyCalls[0]!.title).toBe("成绩已更新");
    expect(notifyCalls[0]!.content).toContain("更新");

    const updates = operations.filter((o) => o.kind === "update");
    expect(updates).toHaveLength(1);
    expect((updates[0]!.set as Record<string, unknown>).teacherComment).toBe("更新后的评语");
    expect((updates[0]!.set as Record<string, unknown>).totalScore).toBe("80");
});

test("grading POST rejects modification when submission is rejected", async () => {
    const { module, operations, notifyCalls } = await loadGradingModule({
        select: [
            [{ id: 1 }],
            [{ ...detailRowBase, status: 3 }],
        ],
    });

    const response = await module.gradingDetailRoutes.POST!(
        postGradingRequest("99", {
            scoreQuestionnaire: 80,
            scoreProcess: 80,
            scoreReport: 80,
            totalScore: 80,
            comment: "尝试改分",
            status: 2,
        })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { success?: boolean; error?: { code?: string } };
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe("REJECTED_NOT_EDITABLE");
    expect(notifyCalls).toHaveLength(0);
    expect(operations.filter((o) => o.kind === "update")).toHaveLength(0);
});

test("grading POST rejects body.status=3 when submission already graded", async () => {
    const { module, notifyCalls } = await loadGradingModule({
        select: [
            [{ id: 1 }],
            [{ ...detailRowBase, status: 2 }],
            [{ weightConfig: { questionnaire: 30, process: 30, report: 40 } }],
        ],
    });

    const response = await module.gradingDetailRoutes.POST!(
        postGradingRequest("99", {
            scoreQuestionnaire: 80,
            scoreProcess: 80,
            scoreReport: 80,
            totalScore: 80,
            comment: "x",
            status: 3,
            rejectReason: "12345678901",
        })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { success?: boolean; error?: { code?: string } };
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe("VALIDATION_ERROR");
    expect(notifyCalls).toHaveLength(0);
});

test("grading POST first-time grade still sends GRADE_COMPLETED and updates experiment", async () => {
    const { module, operations, notifyCalls } = await loadGradingModule({
        select: [
            [{ id: 1 }],
            [{ ...detailRowBase, status: 1 }],
            [{ weightConfig: { questionnaire: 30, process: 30, report: 40 } }],
        ],
        update: [{ affectedRows: 1 }, { affectedRows: 1 }],
    });

    const response = await module.gradingDetailRoutes.POST!(
        postGradingRequest("99", {
            scoreQuestionnaire: 90,
            scoreProcess: 90,
            scoreReport: 90,
            totalScore: 90,
            comment: "首次批改",
            status: 2,
        })
    );

    expect(response.status).toBe(200);
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]!.type).toBe("GRADE_COMPLETED");
    expect(notifyCalls[0]!.title).toBe("作业已批改");

    const updates = operations.filter((o) => o.kind === "update");
    expect(updates.length).toBeGreaterThanOrEqual(2);
});
