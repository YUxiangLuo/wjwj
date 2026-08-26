import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("storage cleanup retains a file while any other topic or attachment references it", async () => {
    const filePath = `/storage/shared-${crypto.randomUUID()}.pdf`;
    const absolutePath = `${process.cwd()}${filePath}`;
    await Bun.write(absolutePath, "shared");
    const { db } = createMockDb({ select: [[{ count: 1 }], [{ count: 0 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./storage-cleanup.ts?shared=${crypto.randomUUID()}`);

    try {
        expect(await module.deleteTopicStorageFileIfUnreferenced(filePath, { excludeTopicId: 12 })).toBe(false);
        expect(await Bun.file(absolutePath).exists()).toBe(true);
    } finally {
        await Bun.file(absolutePath).delete().catch(() => undefined);
    }
});

test("storage cleanup removes an unreferenced file while holding the mutation lock", async () => {
    const filePath = `/storage/unreferenced-${crypto.randomUUID()}.pdf`;
    const absolutePath = `${process.cwd()}${filePath}`;
    await Bun.write(absolutePath, "orphan");
    const { db, operations } = createMockDb({ select: [[{ count: 0 }], [{ count: 0 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./storage-cleanup.ts?orphan=${crypto.randomUUID()}`);

    expect(await module.deleteTopicStorageFileIfUnreferenced(filePath)).toBe(true);
    expect(await Bun.file(absolutePath).exists()).toBe(false);
    expect(operations[0]?.kind).toBe("transaction");
    expect(operations[1]?.kind).toBe("execute");
});
