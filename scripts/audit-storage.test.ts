import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createMockDb } from "../src/test-utils/mock-db";
import { loadReferences } from "./audit-storage";

test("storage audit treats only active topics and their attachments as current references", async () => {
    const { db, operations } = createMockDb({
        select: [
            [{ path: "/storage/uploads/active-topic.csv" }],
            [{ path: "/storage/uploads/active-attachment.pdf" }],
        ],
    });

    const references = await loadReferences(
        db as unknown as Parameters<typeof loadReferences>[0],
        {
            topic_table: "topic",
            attachment_table: "topic_attachment",
            submission_table: null,
            legacy_sampling_column: false,
        },
    );

    expect([...references].sort()).toEqual([
        resolve(process.cwd(), "storage/uploads/active-attachment.pdf"),
        resolve(process.cwd(), "storage/uploads/active-topic.csv"),
    ]);

    const selects = operations.filter((operation) => operation.kind === "select");
    expect(selects).toHaveLength(2);
    expect(selects[0]?.where).toBeTruthy();
    expect(selects[1]?.where).toBeTruthy();
    expect(selects[1]?.joins?.map((join) => join.type)).toEqual(["innerJoin"]);
});
