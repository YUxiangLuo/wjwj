import { expect, test } from "bun:test";
import { hasSameSamplingMapping } from "./sampling-mapping";

const target = { kind: "mean", field: "y" } as const;
const contract = { version: 1, researchQuestion: "平均值是多少？", targetPopulation: "全部单位", unitOfAnalysis: "一个单位", target };
const mapping = { identifier: "id", numeric: ["y", "size"], stratified: ["g"], others: ["cat"], studyContract: contract };

test("equivalent mappings preserve policies across JSONB key order, role order and mirrored targets", () => {
    expect(hasSameSamplingMapping(JSON.stringify(mapping), {
        studyContract: contract, others: ["cat"], stratified: ["g"], numeric: ["size", "y"], identifier: "id", analysisTarget: target,
    })).toBe(true);
    expect(hasSameSamplingMapping({ identifier: "id", numeric: ["y"], analysisTarget: target }, {
        identifier: "id", numeric: ["y"], others: [], stratified: [], studyContract: contract,
    })).toBe(true);
});

test("research description edits do not change sampling requirements", () => {
    expect(hasSameSamplingMapping(mapping, { ...mapping, studyContract: { ...contract, researchQuestion: "新的研究表述" } })).toBe(true);
});

test("field roles, exact keys and targets remain meaningful changes", () => {
    for (const next of [
        { ...mapping, identifier: "other_id" },
        { ...mapping, numeric: ["y"] },
        { ...mapping, stratified: [], others: ["cat", "g"] },
        { ...mapping, others: [] },
        { ...mapping, numeric: ["y", "size "] },
        { ...mapping, studyContract: { ...contract, target: { kind: "mean", field: "size" } } },
        { ...mapping, studyContract: { ...contract, target: { kind: "proportion", field: "cat", value: "是" } } },
    ]) expect(hasSameSamplingMapping(mapping, next)).toBe(false);
    const proportion = { ...mapping, studyContract: { ...contract, target: { kind: "proportion", field: "cat", value: "是" } } };
    expect(hasSameSamplingMapping(proportion, { ...proportion, studyContract: { ...proportion.studyContract, target: { kind: "proportion", field: "cat", value: "否" } } })).toBe(false);
});

test("legacy inferred target order and explicit target restrictions are not ignored", () => {
    const legacy = { identifier: "id", numeric: ["y", "size"] };
    expect(hasSameSamplingMapping(legacy, { ...legacy, numeric: ["size", "y"] })).toBe(false);
    expect(hasSameSamplingMapping(legacy, { ...legacy, analysisTarget: target })).toBe(false);
});

test("first mapping and file-replacement invalidation always reset policies", () => {
    expect(hasSameSamplingMapping(null, mapping)).toBe(false);
    expect(hasSameSamplingMapping(undefined, mapping)).toBe(false);
    expect(hasSameSamplingMapping({ ...mapping, numeric: "y" }, mapping)).toBe(false);
});
