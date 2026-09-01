import { expect, test } from "bun:test";
import {
    buildDefaultResearchQuestion,
    buildDefaultStudyContract,
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
});
