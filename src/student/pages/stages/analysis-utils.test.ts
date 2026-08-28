import { expect, test } from "bun:test";
import { preferAnalysisField } from "./analysis-utils";

test("preferAnalysisField keeps a valid user selection", () => {
    expect(preferAnalysisField(["每周学习时长", "月生活费"], "月生活费", "每周学习时长")).toBe("月生活费");
});

test("preferAnalysisField defaults empty or missing selection to the analysis target", () => {
    expect(preferAnalysisField(["每周学习时长", "月生活费"], "", "每周学习时长")).toBe("每周学习时长");
    expect(preferAnalysisField(["每周学习时长", "月生活费"], "已删除字段", "每周学习时长")).toBe("每周学习时长");
});

test("preferAnalysisField falls back to the first field when the target is absent", () => {
    expect(preferAnalysisField(["月生活费"], "", "每周学习时长")).toBe("月生活费");
    expect(preferAnalysisField([], "", "每周学习时长")).toBe("");
});
