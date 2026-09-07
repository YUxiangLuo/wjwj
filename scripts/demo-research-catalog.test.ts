import { expect, test } from "bun:test";
import { buildDemoResearchCatalog } from "./demo-research-catalog";
import { parseSpreadsheetFile } from "../src/lib/spreadsheet";
import { validateMappedPopulationData, validateTopicPublishReadiness } from "../src/teacher/topic/validation";
import { validateRecommendQuestionsPayload } from "../src/lib/validate-question";
import { executeSamplingAction } from "../src/student/experiment/sampling-service";

for (const topic of buildDemoResearchCatalog()) {
    test(`demo research topic ${topic.key} can be mapped, published and sampled`, async () => {
        const parsed = await parseSpreadsheetFile(new TextEncoder().encode(topic.csv).buffer, `${topic.key}.csv`);
        expect(validateMappedPopulationData(parsed, topic.fieldMapping)).toBeNull();
        expect(validateTopicPublishReadiness({ excelFilePath: "/storage/example.csv", fieldMapping: topic.fieldMapping, samplingPolicy: topic.samplingPolicy, weightConfig: topic.weightConfig })).toBeNull();
        expect(validateRecommendQuestionsPayload(topic.recommendQuestions)).toBeNull();
        const n = 40;
        for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
            if (topic.samplingPolicy.methods[method] === "disabled") continue;
            const groups = [...new Set(topic.rows.map(row => String(row[topic.fieldMapping.stratified[0]!])))] as string[];
            const rawParams = { sampleSize: n, seed: 17, sizeField: topic.fieldMapping.numeric.find(field => field !== topic.fieldMapping.studyContract.target.field), stratifyBy: topic.fieldMapping.stratified[0], layers: groups.map((name, i) => ({ name, sampleCount: Math.floor(n / groups.length) + (i < n % groups.length ? 1 : 0) })) };
            const sample = await executeSamplingAction({ method, rawParams, targetSampleSize: n, population: topic.rows, fieldMapping: topic.fieldMapping });
            expect(sample.ok).toBe(true);
            if (sample.ok) expect(sample.result.sampleCount).toBe(n);
        }
    });
}
