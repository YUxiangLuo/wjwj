import { expect, test } from "bun:test";
import {
    analysisTargetConflictsWithSizeField,
    buildDefaultResearchQuestion,
    fieldDisplayName,
    formatAnalysisTargetSummary,
    formatStudyContractSummary,
    parseAnalysisTarget,
    parseStudyContract,
    resolveAnalysisTarget,
    resolveStudyContract,
    retitleGeneratedStudyContract,
    validateAnalysisTarget,
    validateStudyContract,
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

const contractMapping = {
    ...mapping,
    analysisTarget: { kind: "mean" as const, field: "每周学习时长" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "该校学生每周学习时长的平均水平是多少？",
        targetPopulation: "该校全体学生",
        unitOfAnalysis: "一名学生",
        target: { kind: "mean" as const, field: "每周学习时长" },
    },
};

test("parseStudyContract requires complete versioned payloads", () => {
    expect(parseStudyContract(contractMapping)).toEqual(contractMapping.studyContract);
    expect(parseStudyContract(mapping)).toBeNull();
    expect(parseStudyContract({ ...contractMapping, studyContract: { ...contractMapping.studyContract, version: 2 } })).toBeNull();
    expect(parseStudyContract({ ...contractMapping, studyContract: { ...contractMapping.studyContract, researchQuestion: " " } })).toBeNull();
    expect(parseStudyContract({ ...contractMapping, studyContract: { ...contractMapping.studyContract, target: { kind: "mean", field: "" } } })).toBeNull();
});

test("retitleGeneratedStudyContract updates only system-generated research questions", () => {
    const target = { kind: "mean" as const, field: "每周学习时长" };
    const generated = {
        ...mapping,
        analysisTarget: target,
        studyContract: {
            version: 1 as const,
            researchQuestion: buildDefaultResearchQuestion("学习调查", target),

            targetPopulation: "全体学生",
            unitOfAnalysis: "一名学生",
            target,
        },
    };
    expect(retitleGeneratedStudyContract(generated, "学习调查", "学习调查 (副本)"))
        .toMatchObject({
            studyContract: { researchQuestion: "学习调查 (副本)中每周学习时长的平均水平是多少？" },
        });

    const custom = {
        ...generated,
        studyContract: { ...generated.studyContract, researchQuestion: "学生投入学习时间是否充足？" },
    };
    expect(retitleGeneratedStudyContract(custom, "学习调查", "新名称")).toBe(custom);
});

test("parseAnalysisTarget prefers the study contract target over the legacy field", () => {
    expect(parseAnalysisTarget({
        ...contractMapping,
        analysisTarget: { kind: "proportion", field: "性别", value: "女" },
    })).toEqual({ kind: "mean", field: "每周学习时长" });
});

test("resolveStudyContract infers a compatible contract for legacy mappings", () => {
    expect(resolveStudyContract(contractMapping)).toEqual({ contract: contractMapping.studyContract, inferred: false });
    const inferred = resolveStudyContract({
        ...mapping,
        analysisTarget: { kind: "proportion" as const, field: "性别", value: "女" },
    }, { topicName: "课堂调查" });
    expect(inferred?.inferred).toBe(true);
    expect(inferred?.contract).toEqual({
        version: 1,
        researchQuestion: "课堂调查",
        targetPopulation: "上传总体数据中的全部单位",
        unitOfAnalysis: "总体数据中的一行记录",
        target: { kind: "proportion", field: "性别", value: "女" },
    });
    expect(resolveStudyContract({ ...mapping, numeric: [] })).toBeNull();
    const inferredDefault = resolveStudyContract(mapping);
    expect(inferredDefault?.contract.researchQuestion).toBe("总体中每周学习时长的平均水平是多少？");
});

test("validateStudyContract enforces completeness, lengths, and legacy consistency", () => {
    expect(validateStudyContract(contractMapping)).toBeNull();
    expect(validateStudyContract(mapping)).toBe("请填写完整的研究问题、目标总体、分析单位和对照变量");
    expect(validateStudyContract({
        ...contractMapping,
        studyContract: { ...contractMapping.studyContract, researchQuestion: "太短" },
    })).toBe("研究问题长度需在 5-300 字之间");
    expect(validateStudyContract({
        ...contractMapping,
        studyContract: { ...contractMapping.studyContract, targetPopulation: "长".repeat(201) },
    })).toBe("目标总体长度需在 2-200 字之间");
    expect(validateStudyContract({
        ...contractMapping,
        studyContract: { ...contractMapping.studyContract, unitOfAnalysis: "" },
    })).toBe("请填写完整的研究问题、目标总体、分析单位和对照变量");
    expect(validateStudyContract({
        ...contractMapping,
        analysisTarget: { kind: "proportion", field: "性别", value: "女" },
    })).toBe("研究合同与兼容对照变量不一致");
    expect(validateStudyContract({
        ...contractMapping,
        studyContract: { ...contractMapping.studyContract, target: { kind: "mean", field: "性别" } },
        analysisTarget: { kind: "mean", field: "性别" },
    })).toBe("均值对照变量必须是已映射的数值字段");
});

test("formatStudyContractSummary renders explicit and inferred contracts", () => {
    const explicit = formatStudyContractSummary({ contract: contractMapping.studyContract, inferred: false }, { marginLabel: "±5%" });
    expect(explicit).toContain("研究目标：该校学生每周学习时长的平均水平是多少？");
    expect(explicit).toContain("总体：该校全体学生");
    expect(explicit).toContain("分析单位：一名学生");
    expect(explicit).toContain("估计量：每周学习时长 的均值；目标误差限 ±5%");
    const inferred = formatStudyContractSummary({
        contract: { ...contractMapping.studyContract, target: { kind: "proportion", field: "性别", value: "女" } },
        inferred: true,
    });
    expect(inferred).toContain("兼容目标：");
    expect(inferred).toContain("估计量：性别 中「女」的比例");
    expect(formatStudyContractSummary(null)).toBe("课题未指定研究目标。问卷是预试，不进入估计。");
});

test("fieldDisplayName gives readable Chinese for common English target columns", () => {
    expect(fieldDisplayName("monthly_spending")).toBe("每月消费支出");
    expect(fieldDisplayName("age")).toBe("年龄");
    expect(fieldDisplayName("wait_time")).toBe("等待时长");
});

test("fieldDisplayName keeps Chinese names and falls back for unknown columns", () => {
    expect(fieldDisplayName("每周学习时长")).toBe("每周学习时长");
    expect(fieldDisplayName("mystery_col")).toBe("mystery_col");
    expect(fieldDisplayName("  ")).toBe("");
});

test("default research questions use the readable name instead of the raw column", () => {
    const question = buildDefaultResearchQuestion("月消费调查", { kind: "mean", field: "monthly_spending" });
    expect(question).toBe("月消费调查中每月消费支出的平均水平是多少？");
    expect(question).not.toContain("monthly_spending");

    // Unknown columns still fall back to the raw field rather than guessing.
    expect(buildDefaultResearchQuestion("未知调查", { kind: "mean", field: "mystery_col" })).toContain("mystery_col");
});
