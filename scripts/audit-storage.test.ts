import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createMockDb } from "../src/test-utils/mock-db";
import {
    auditStorageSnapshot,
    executeStorageAudit,
    loadReferences,
    parseAuditArgs,
    storageDeletionToken,
} from "./audit-storage";

test("storage audit treats every persisted topic and attachment as a current reference", async () => {
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
    expect(selects[0]?.where).toBeUndefined();
    expect(selects[1]?.where).toBeUndefined();
    expect(selects[1]?.joins).toBeUndefined();
});

test("storage deletion confirmation changes with the exact orphan manifest", () => {
    const first = storageDeletionToken([{ path: "storage/a.txt", size: 10 }]);
    expect(first).toHaveLength(16);
    expect(storageDeletionToken([{ path: "storage/a.txt", size: 10 }])).toBe(first);
    expect(storageDeletionToken([{ path: "storage/a.txt", size: 11 }])).not.toBe(first);
});

test("parseAuditArgs parses delete, verify-references, and confirm flags", () => {
    expect(parseAuditArgs([])).toEqual({
        shouldDelete: false,
        verifyReferences: false,
        confirmToken: undefined,
    });
    expect(parseAuditArgs(["--verify-references"])).toEqual({
        shouldDelete: false,
        verifyReferences: true,
        confirmToken: undefined,
    });
    expect(parseAuditArgs(["--delete", "--confirm=0123456789abcdef"])).toEqual({
        shouldDelete: true,
        verifyReferences: false,
        confirmToken: "0123456789abcdef",
    });
});

test("default storage audit warns on missing referenced files without throwing, while --verify-references fails closed", async () => {
    const cwd = "/tmp/wj-audit-test";
    const missingRef = resolve(cwd, "storage/uploads/missing-topic.xlsx");
    const presentRef = resolve(cwd, "storage/uploads/present-attachment.pdf");
    const orphanFile = resolve(cwd, "storage/uploads/orphan.bin");
    const references = new Set([missingRef, presentRef]);
    const files = [presentRef, orphanFile];

    const logs: string[] = [];
    const warnings: string[] = [];
    const summary = await executeStorageAudit({
        files,
        references,
        options: parseAuditArgs([]),
        cwd,
        fileSize: () => 128,
        log: (line) => logs.push(line),
        warn: (line) => warnings.push(line),
    });

    expect(summary.missingReferences).toEqual([missingRef]);
    expect(summary.orphans).toEqual([orphanFile]);
    expect(logs).toContain("缺失引用文件：1");
    expect(warnings.some((line) => line.includes("storage/uploads/missing-topic.xlsx"))).toBe(true);
    expect(warnings.some((line) => line.includes("--verify-references"))).toBe(true);
    expect(logs.some((line) => line.includes(`bun run storage:clean --confirm=${summary.deletionToken}`))).toBe(true);
    expect(logs.some((line) => line.includes("-- --confirm="))).toBe(false);

    await expect(executeStorageAudit({
        files,
        references,
        options: parseAuditArgs(["--verify-references"]),
        cwd,
        fileSize: () => 128,
        log: () => undefined,
        warn: () => undefined,
    })).rejects.toThrow("发现 1 个数据库引用的存储文件缺失");

    // Passing --verify-references succeeds once all referenced files exist on disk.
    const healthy = auditStorageSnapshot({
        files: [missingRef, presentRef],
        references,
        cwd,
        fileSize: () => 128,
    });
    expect(healthy.missingReferences).toEqual([]);
    await expect(executeStorageAudit({
        files: [missingRef, presentRef],
        references,
        options: parseAuditArgs(["--verify-references"]),
        cwd,
        fileSize: () => 128,
        log: () => undefined,
        warn: () => undefined,
    })).resolves.toMatchObject({ missingReferences: [], orphans: [] });
});

test("storage clean mismatch error matches DATABASE.md confirm syntax", async () => {
    const cwd = "/tmp/wj-audit-test";
    const orphanFile = resolve(cwd, "storage/uploads/orphan.bin");
    const expectedToken = storageDeletionToken([{ path: "storage/uploads/orphan.bin", size: 64 }]);

    await expect(executeStorageAudit({
        files: [orphanFile],
        references: new Set(),
        options: parseAuditArgs(["--delete", "--confirm=wrongtoken"]),
        cwd,
        fileSize: () => 64,
        log: () => undefined,
        warn: () => undefined,
    })).rejects.toThrow(`bun run storage:clean --confirm=${expectedToken}`);
});
