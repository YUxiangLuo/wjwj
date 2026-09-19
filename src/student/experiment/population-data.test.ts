import { afterEach, expect, test } from "bun:test";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    buildStratifiedStats,
    clearPopulationDataCacheForTests,
    getPpsEligibleNumericFields,
    readPopulationData,
} from "./population-data";
import { deleteStorageFileIfExists, writeStorageFile } from "../../server/storage-files";

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
