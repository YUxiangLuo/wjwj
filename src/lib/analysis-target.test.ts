import { expect, test } from "bun:test";
import {
    analysisTargetConflictsWithSizeField,
    formatAnalysisTargetSummary,
    parseAnalysisTarget,
    resolveAnalysisTarget,
    validateAnalysisTarget,
} from "./analysis-target";

const mapping = {
    identifier: "编号",
    numeric: ["每周学习时长", "月生活费"],
    stratified: ["年级", "性别"],
    others: ["专业"],
};

test("parseAnalysisTarget accepts mean and proportion payloads", () => {
    expect(parseAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "mean", field: "每周学习时长" },
    })).toEqual({ kind: "mean", field: "每周学习时长" });
    expect(parseAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "proportion", field: "性别", value: "女" },
    })).toEqual({ kind: "proportion", field: "性别", value: "女" });
    expect(parseAnalysisTarget(mapping)).toBeNull();
});

test("resolveAnalysisTarget falls back to the first numeric field as a mean", () => {
    const resolved = resolveAnalysisTarget(mapping);
    expect(resolved).toEqual({
        target: { kind: "mean", field: "每周学习时长" },
        inferred: true,
    });
    expect(formatAnalysisTargetSummary(resolved)).toContain("课题未指定，暂用 每周学习时长 的均值");
});

test("validateAnalysisTarget requires a mapped field and existing proportion category", () => {
    expect(validateAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "mean", field: "每周学习时长" },
    })).toBeNull();
    expect(validateAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "mean", field: "性别" },
    })).toBe("均值对照变量必须是已映射的数值字段");
    expect(validateAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "proportion", field: "性别", value: "女" },
        rows: [{ 性别: "男" }],
    }, [{ 性别: "男" }])).toBe("比例对照类别「女」在字段 性别 中不存在");
    expect(validateAnalysisTarget({
        ...mapping,
        analysisTarget: { kind: "proportion", field: "性别", value: "女" },
    }, [{ 性别: "女" }])).toBeNull();
});

test("PPS size field cannot equal the analysis target field", () => {
    expect(analysisTargetConflictsWithSizeField({ kind: "mean", field: "月生活费" }, "月生活费")).toBe(true);
    expect(analysisTargetConflictsWithSizeField({ kind: "mean", field: "每周学习时长" }, "月生活费")).toBe(false);
});
