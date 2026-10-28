import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureImmutableFile } from "./immutable-file";

const bytes = (text: string) => new TextEncoder().encode(text);

test("immutable file publication preserves an existing version and reuses identical bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wj-immutable-file-"));
    const target = join(directory, "population.xlsx");
    try {
        await ensureImmutableFile(target, bytes("original workbook"));
        const before = await stat(target);
        await ensureImmutableFile(target, bytes("original workbook"));
        expect((await stat(target)).ino).toBe(before.ino);
        await expect(ensureImmutableFile(target, bytes("different workbook"))).rejects.toThrow("目标版本文件已存在且内容不同");
        expect(await Bun.file(target).text()).toBe("original workbook");
        expect(await readdir(directory)).toEqual(["population.xlsx"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("competing immutable file publishers cannot overwrite the winning complete bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wj-immutable-file-"));
    const target = join(directory, "population.xlsx");
    const versions = ["A".repeat(65_536), "B".repeat(65_536)];
    try {
        const outcomes = await Promise.allSettled(versions.map(value => ensureImmutableFile(target, bytes(value))));
        expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
        const winner = outcomes.findIndex(result => result.status === "fulfilled");
        expect(await Bun.file(target).text()).toBe(versions[winner]!);
        expect(await readdir(directory)).toEqual(["population.xlsx"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("concurrent retries of identical bytes succeed and remove only their own temporary files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wj-immutable-file-"));
    const target = join(directory, "population.xlsx");
    const unrelated = join(directory, ".someone-elses-work.tmp");
    try {
        await Bun.write(unrelated, "unrelated work");
        await Promise.all(Array.from({ length: 4 }, () => ensureImmutableFile(target, bytes("same complete workbook"))));
        expect(await Bun.file(target).text()).toBe("same complete workbook");
        expect(await Bun.file(unrelated).text()).toBe("unrelated work");
        expect((await readdir(directory)).sort()).toEqual([".someone-elses-work.tmp", "population.xlsx"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
