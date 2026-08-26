import { expect, test } from "bun:test";
import {
    buildPopulationNumericStats,
    buildStratifiedStats,
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

test("population numeric stats do not coerce blank cells to zero", () => {
    const stats = buildPopulationNumericStats([{ x: 10 }, { x: "" }, { x: null }, { x: 20 }], ["x"]);
    expect(stats.x?.count).toBe(2);
    expect(stats.x?.mean).toBe(15);
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
            年龄: 20,
            月消费: 1800,
            抽样权重: 1.2,
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
