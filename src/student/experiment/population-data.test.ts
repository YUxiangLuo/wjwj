import { afterEach, expect, spyOn, test } from "bun:test";
import { utimes } from "node:fs/promises";
import * as spreadsheet from "../../lib/spreadsheet";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    buildStratifiedStats,
    clearPopulationDataCacheForTests,
    getPpsEligibleNumericFields,
    readPopulationData,
} from "./population-data";
import { deleteStorageFileIfExists, resolveStoragePath, writeStorageFile } from "../../server/storage-files";

const UTF8_CSV = [
    "编号,城市等级,年龄,月消费,抽样权重,专业",
    "A001,一线,20,1800,1.2,统计学",
    "A002,二线,21,2200,1.5,计算机",
    "A003,一线,22,2600,1.8,统计学",
].join("\n");

afterEach(() => clearPopulationDataCacheForTests());

test("population numeric stats do not coerce blank cells to zero", () => {
    const stats = buildPopulationNumericStats([{ x: 10 }, { x: "" }, { x: null }, { x: 20 }], ["x"]);
    expect(stats.x?.count).toBe(2);
    expect(stats.x?.mean).toBe(15);
});

test("population categories treat Object prototype names as ordinary values", () => {
    const stats = buildPopulationCategoricalStats([
        { group: "__proto__" },
        { group: "constructor" },
        { group: "toString" },
        { group: "__proto__" },
    ], ["group"]);

    expect(stats.group?.["__proto__"]).toBe(2);
    const constructorKey: string = "constructor";
    const toStringKey: string = "toString";
    expect(stats.group?.[constructorKey]).toBe(1);
    expect(stats.group?.[toStringKey]).toBe(1);
    expect(Object.keys(stats.group ?? {})).toHaveLength(3);
});

test("ordinary categorical statistics keep missing values in the denominator", () => {
    const stats = buildPopulationCategoricalStats([
        { choice: "是" }, { choice: "" }, { choice: null }, { choice: "否" },
    ], ["choice"]);
    expect(stats.choice).toMatchObject({ 是: 1, 否: 1, "（缺失值）": 2 });
});

test("readPopulationData preserves Chinese UTF-8 CSV fields without a BOM", async () => {
    const storagePath = `/storage/uploads/population-${crypto.randomUUID()}.csv`;
    await writeStorageFile(storagePath, UTF8_CSV);

    try {
        const rows = await readPopulationData(storagePath);

        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({
            编号: "A001",
            城市等级: "一线",
            年龄: "20",
            月消费: "1800",
            抽样权重: "1.2",
            专业: "统计学",
        });
        expect(buildStratifiedStats(rows, { stratified: ["城市等级"] })).toEqual({
            城市等级: { 一线: 2, 二线: 1 },
        });
        expect(buildPopulationNumericStats(rows, ["月消费"])["月消费"]?.count).toBe(3);
        expect(getPpsEligibleNumericFields(rows, ["抽样权重"])).toEqual(["抽样权重"]);
    } finally {
        await deleteStorageFileIfExists(storagePath);
    }
});

test("readPopulationData caches populations larger than the former 20k-row cutoff", async () => {
    const storagePath = `/storage/uploads/population-large-${crypto.randomUUID()}.csv`;
    const csv = [
        "id,value",
        ...Array.from({ length: 20_001 }, (_, index) => `${index + 1},${index % 7}`),
    ].join("\n");
    await writeStorageFile(storagePath, csv);

    try {
        const [first, concurrent] = await Promise.all([
            readPopulationData(storagePath),
            readPopulationData(storagePath),
        ]);
        const cached = await readPopulationData(storagePath);

        expect(first).toHaveLength(20_001);
        expect(concurrent).toBe(first);
        expect(cached).toBe(first);
    } finally {
        await deleteStorageFileIfExists(storagePath);
    }
});

test("readPopulationData returns an immutable population for identity-based statistics caches", async () => {
    const storagePath = `/storage/uploads/population-immutable-${crypto.randomUUID()}.csv`;
    await writeStorageFile(storagePath, UTF8_CSV);

    try {
        const rows = await readPopulationData(storagePath);

        expect(Object.isFrozen(rows)).toBe(true);
        expect(Object.isFrozen(rows[0])).toBe(true);
        expect(() => rows.push({ 编号: "A004" })).toThrow();
        expect(() => { rows[0]!.月消费 = "9999"; }).toThrow();
        expect((await readPopulationData(storagePath))[0]?.月消费).toBe("1800");
    } finally {
        await deleteStorageFileIfExists(storagePath);
    }
});

test("concurrent unreadable population requests share the failure contract", async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        const missing = `/storage/uploads/missing-${crypto.randomUUID()}.csv`;
        const [first, second] = await Promise.all([
            readPopulationData(missing),
            readPopulationData(missing),
        ]);
        expect(first).toEqual([]);
        expect(second).toEqual([]);
    } finally {
        console.error = originalConsoleError;
    }
});

test("population cache distinguishes replacements with the same path, length and mtime", async () => {
    const path = `/storage/uploads/population-replaced-${crypto.randomUUID()}.csv`;
    const fullPath = resolveStoragePath(path);
    const time = new Date("2026-10-28T00:00:00Z");
    const mapping = { numeric: ["月消费"] };
    try {
        await writeStorageFile(path, UTF8_CSV);
        await utimes(fullPath, time, time);
        const oldMetadata = { size: Bun.file(fullPath).size, mtime: Bun.file(fullPath).lastModified };
        const first = await readPopulationData(path, mapping);
        await writeStorageFile(path, UTF8_CSV.replace("1800", "9800"));
        await utimes(fullPath, time, time);
        expect({ size: Bun.file(fullPath).size, mtime: Bun.file(fullPath).lastModified }).toEqual(oldMetadata);
        const replaced = await readPopulationData(path, mapping);
        expect(replaced[0]?.月消费).toBe(9800);
        expect(replaced).not.toBe(first);
        expect(first[0]?.月消费).toBe(1800);
        expect(await readPopulationData(path, mapping)).toBe(replaced);
    } finally { await deleteStorageFileIfExists(path); }
});

test("unchanged contents retain population identity after metadata changes", async () => {
    const path = `/storage/uploads/population-touched-${crypto.randomUUID()}.csv`;
    try {
        await writeStorageFile(path, UTF8_CSV);
        const first = await readPopulationData(path);
        await writeStorageFile(path, UTF8_CSV);
        await utimes(resolveStoragePath(path), new Date("2020-01-01"), new Date("2020-01-01"));
        expect(await readPopulationData(path)).toBe(first);
    } finally { await deleteStorageFileIfExists(path); }
});

test("twenty concurrent population requests share one raw read and one parsed identity", async () => {
    const path = `/storage/uploads/population-concurrent-${crypto.randomUUID()}.csv`;
    await writeStorageFile(path, UTF8_CSV);
    const originalFile = Bun.file;
    const fileSpy = spyOn(Bun, "file").mockImplementation(originalFile);
    try {
        const rows = await Promise.all(Array.from({ length: 20 }, () => readPopulationData(path)));
        expect(fileSpy).toHaveBeenCalledTimes(1);
        expect(rows.every(value => value === rows[0])).toBe(true);
        expect(rows[0]?.[0]?.月消费).toBe("1800");
        expect(await readPopulationData(path)).toBe(rows[0]!);
        // A warm request still reads and hashes the bytes; only parsing is cached.
        expect(fileSpy).toHaveBeenCalledTimes(2);
    } finally {
        fileSpy.mockRestore();
        await deleteStorageFileIfExists(path);
    }
});

test("concurrent numeric interpretations share bytes without sharing incompatible parsed rows", async () => {
    const path = `/storage/uploads/population-roles-${crypto.randomUUID()}.csv`;
    await writeStorageFile(path, UTF8_CSV);
    const originalFile = Bun.file;
    const fileSpy = spyOn(Bun, "file").mockImplementation(originalFile);
    try {
        const [numeric, displayed] = await Promise.all([
            readPopulationData(path, { numeric: ["月消费", "年龄"] }),
            // This used to collide with the two-field interpretation's joined key.
            readPopulationData(path, { numeric: ["月消费\u001f年龄"] }),
        ]);
        expect(fileSpy).toHaveBeenCalledTimes(1);
        expect(numeric[0]?.月消费).toBe(1800);
        expect(displayed[0]?.月消费).toBe("1800");
        expect(numeric).not.toBe(displayed);
    } finally {
        fileSpy.mockRestore();
        await deleteStorageFileIfExists(path);
    }
});

test("a completed raw read does not hide a replacement while its previous parse is pending", async () => {
    const path = `/storage/uploads/population-parse-pending-${crypto.randomUUID()}.csv`;
    await writeStorageFile(path, UTF8_CSV);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const parse = spreadsheet.parseSpreadsheetFile;
    let calls = 0;
    const parseSpy = spyOn(spreadsheet, "parseSpreadsheetFile").mockImplementation(async (...args) => {
        if (calls++ === 0) { entered.resolve(); await release.promise; }
        return parse(...args);
    });
    const first = readPopulationData(path, { numeric: ["月消费"] });
    try {
        await entered.promise;
        await writeStorageFile(path, UTF8_CSV.replace("1800", "9800"));
        const newer = await readPopulationData(path, { numeric: ["月消费"] });
        expect(newer[0]?.月消费).toBe(9800);
        release.resolve();
        expect((await first)[0]?.月消费).toBe(1800);
        // Even if the older parse finishes last, a later read validates its bytes.
        expect((await readPopulationData(path, { numeric: ["月消费"] }))[0]?.月消费).toBe(9800);
    } finally {
        release.resolve();
        await first;
        parseSpy.mockRestore();
        await deleteStorageFileIfExists(path);
    }
});

test("a failed file read does not prevent a later successful read at the same path", async () => {
    const path = `/storage/uploads/population-recovered-${crypto.randomUUID()}.csv`;
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
        expect(await readPopulationData(path)).toEqual([]);
        await writeStorageFile(path, UTF8_CSV);
        expect((await readPopulationData(path))[0]?.月消费).toBe("1800");
    } finally {
        errorSpy.mockRestore();
        await deleteStorageFileIfExists(path);
    }
});
