import { expect, test } from "bun:test";
import { resolveTopicViewStudyContract } from "./TopicViewDialog";

test("published topic view resolves the full read-only study contract", () => {
    const target = { kind: "mean" as const, field: "每周学习时长" };
    const resolved = resolveTopicViewStudyContract({
        identifier: "编号",
        stratified: ["年级"],
        numeric: ["每周学习时长"],
        analysisTarget: target,
        studyContract: {
            version: 1,
            researchQuestion: "学生每周学习时长的平均水平是多少？",
            targetPopulation: "该校全体学生",
            unitOfAnalysis: "一名学生",
            target,
        },
    }, "学习调查");

    expect(resolved).toMatchObject({
        inferred: false,
        contract: {
            researchQuestion: "学生每周学习时长的平均水平是多少？",
            targetPopulation: "该校全体学生",
            unitOfAnalysis: "一名学生",
            target,
        },
    });
});
