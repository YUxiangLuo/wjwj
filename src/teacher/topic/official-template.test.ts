import { expect, test } from "bun:test";
import { buildRecommendedFieldMapping } from "./mapping-recommendation";
import { calculateMeanEstimationSampleSize } from "../../student/experiment/sample-plan";

// Guards the shipped teacher template against the two linkage defects found in
// dogfood: the recommendation must not fall back to a demographic column, and
// the file's own variance makes a default mean plan a census.

const csvPath = new URL("../../../public/templates/数据模板.csv", import.meta.url);

async function readOfficialTemplate() {
    const text = await Bun.file(csvPath).text();
    const lines = text.trim().split(/\r?\n/);
    const columns = lines[0]!.split(",");
    const preview = lines.slice(1, 11).map((line) => {
        const cells = line.split(",");
        return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
    });
    return { columns, preview, rows: lines.slice(1) };
}

test("the official teacher template recommends the spending target, not age", async () => {
    const { columns, preview } = await readOfficialTemplate();
    const result = buildRecommendedFieldMapping({ columns, preview, topicName: "月消费支出调查" });

    expect(result.analysisTarget).toEqual({ kind: "mean", field: "monthly_spending" });
    expect(result.numeric[0]).toBe("monthly_spending");
});

test("the official teacher template is a census at the default mean margin", async () => {
    const { columns, rows } = await readOfficialTemplate();
    const spendingIndex = columns.indexOf("monthly_spending");
    const values = rows.map((line) => Number(line.split(",")[spendingIndex]));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);

    const recommended = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: values.length,
        populationVariance: variance,
        designEffect: 1,
        nonResponseRate: 0,
    });

    expect(recommended).toBe(values.length);
});
