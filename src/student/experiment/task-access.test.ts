import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("an unpublished topic cannot be opened through a task URL", async () => {
    const { db } = createMockDb({
        select: [
            [],
            [{ topicStatus: 0 }],
        ],
    });
    mock.module("../../db", () => ({ db }));
    const { getStudentTaskAccessError } = await import(`./task-access.ts?unpublished=${crypto.randomUUID()}`);

    const response = await getStudentTaskAccessError(12, 7);
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({
        success: false,
        error: { code: "TOPIC_UNAVAILABLE", message: "课题未发布" },
    });
});

test("an attachment belonging to another class returns 404 NOT_FOUND matching missing attachments", async () => {
    const { db } = createMockDb({
        select: [
            [],
            [],
        ],
    });
    mock.module("../../db", () => ({ db }));
    const { getStudentTopicAttachmentAccessError } = await import(`./task-access.ts?other-class=${crypto.randomUUID()}`);

    const response = await getStudentTopicAttachmentAccessError(12, 7);
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({
        success: false,
        error: { code: "NOT_FOUND", message: "附件不存在" },
    });
});
