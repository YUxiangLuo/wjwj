import { expect, test } from "bun:test";
import {
    buildDefaultResearchQuestion,
    buildDefaultStudyContract,
    getStudyContractMissingItems,
    isStudyContractComplete,
    resolveResearchQuestionForTargetChange,
} from "./StudyContractEditor";

const meanTarget = { kind: "mean" as const, field: "每周学习时长" };
const proportionTarget = { kind: "proportion" as const, field: "性别", value: "女" };

test("buildDefaultResearchQuestion reflects topic name and target", () => {
    expect(buildDefaultResearchQuestion("学习情况调查", meanTarget)).toBe("学习情况调查中每周学习时长的平均水平是多少？");
    expect(buildDefaultResearchQuestion("", proportionTarget)).toBe("本课题中性别为「女」的单位占比是多少？");
    expect(buildDefaultResearchQuestion("调查", { kind: "proportion", field: "性别", value: "" })).toContain("目标类别");
});

test("resolveResearchQuestionForTargetChange only regenerates untouched defaults", () => {
    const previousDefault = buildDefaultResearchQuestion("学习情况调查", meanTarget);
    // 空白或仍为旧默认值 → 跟随新目标重新生成
    expect(resolveResearchQuestionForTargetChange({
        topicName: "学习情况调查",
        previousTarget: meanTarget,
        previousQuestion: "",
        nextTarget: proportionTarget,
    })).toBe("学习情况调查中性别为「女」的单位占比是多少？");
    expect(resolveResearchQuestionForTargetChange({
        topicName: "学习情况调查",
        previousTarget: meanTarget,
        previousQuestion: previousDefault,
        nextTarget: proportionTarget,
    })).toBe("学习情况调查中性别为「女」的单位占比是多少？");
    // 教师手写过的研究问题不被覆盖
    expect(resolveResearchQuestionForTargetChange({
        topicName: "学习情况调查",
        previousTarget: meanTarget,
        previousQuestion: "学生投入学习时间是否充足？",
        nextTarget: proportionTarget,
    })).toBe("学生投入学习时间是否充足？");

    // 复制/改名后的旧默认问题仍应被识别为系统生成，不能把旧目标带进新合同。
    expect(resolveResearchQuestionForTargetChange({
        topicName: "学习情况调查 (副本)",
        previousTarget: meanTarget,
        previousQuestion: previousDefault,
        nextTarget: proportionTarget,
    })).toBe("学习情况调查 (副本)中性别为「女」的单位占比是多少？");
});

test("buildDefaultStudyContract fills population and unit defaults", () => {
    expect(buildDefaultStudyContract("学习情况调查", meanTarget)).toEqual({
        version: 1,
        researchQuestion: "学习情况调查中每周学习时长的平均水平是多少？",
        targetPopulation: "上传总体数据中的全部单位",
        unitOfAnalysis: "总体数据中的一行记录",
        target: meanTarget,
    });
});

test("isStudyContractComplete enforces target, lengths, and presence", () => {
    expect(isStudyContractComplete(buildDefaultStudyContract("学习情况调查", meanTarget))).toBe(true);
    expect(isStudyContractComplete(undefined)).toBe(false);
    expect(isStudyContractComplete(null)).toBe(false);
    expect(isStudyContractComplete({
        ...buildDefaultStudyContract("学习情况调查", meanTarget),
        researchQuestion: "太短",
    })).toBe(false);
    expect(isStudyContractComplete({
        ...buildDefaultStudyContract("学习情况调查", proportionTarget),
        target: { kind: "proportion", field: "性别", value: "" },
    })).toBe(false);
    expect(isStudyContractComplete({
        ...buildDefaultStudyContract("学习情况调查", meanTarget),
        unitOfAnalysis: "",
    })).toBe(false);
    expect(isStudyContractComplete({
        ...buildDefaultStudyContract("学习情况调查", meanTarget),
        businessDecision: "定".repeat(400),
    })).toBe(true);
    expect(isStudyContractComplete({
        ...buildDefaultStudyContract("学习情况调查", meanTarget),
        businessDecision: "定".repeat(401),
    })).toBe(false);
});

test("getStudyContractMissingItems pinpoints exact missing prerequisites for the wizard footer", () => {
    expect(getStudyContractMissingItems({ stratified: [], numeric: [], others: [] })).toEqual([
        "选择 1 个标识符字段",
        "选择研究目标估计类型（均值或比例）",
    ]);
    expect(getStudyContractMissingItems({
        identifier: "编号",
        stratified: [],
        numeric: [],
        others: ["性别"],
        analysisTarget: { kind: "proportion", field: "性别", value: "" },
        studyContract: {
            version: 1,
            researchQuestion: "短",
            targetPopulation: "单",
            unitOfAnalysis: "",
            target: { kind: "proportion", field: "性别", value: "" },
        },
    })).toEqual([
        "选择比例目标的成功类别",
        "研究问题需 5–300 字（当前 1 字）",
        "目标总体需 2–200 字（当前 1 字）",
        "填写分析单位",
    ]);
    expect(getStudyContractMissingItems({
        identifier: "编号",
        stratified: [],
        numeric: ["每周学习时长"],
        others: [],
        analysisTarget: meanTarget,
        studyContract: buildDefaultStudyContract("学习情况调查", meanTarget),
    })).toEqual([]);
});
