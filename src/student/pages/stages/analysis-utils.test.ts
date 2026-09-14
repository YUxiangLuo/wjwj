import { expect, test } from "bun:test";
import { preferAnalysisField, shortSourceHash } from "./analysis-utils";

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

test("saved analysis source hashes are shortened for the record list", () => {
    const source = "501c8df4d43cea6e09c6590c6522ebb043f98867906252ffdc2c06414066de13";
    expect(shortSourceHash(source)).toBe("501c8df4");
    expect(shortSourceHash("short")).toBe("short");
});
