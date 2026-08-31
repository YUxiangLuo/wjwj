import { expect, test } from "bun:test";
import {
    buildDefaultResearchQuestion,
    resolveResearchQuestionForTargetChange,
} from "./StudyContractEditor";

test("auto-generated research questions follow target kind, field, and category changes", () => {
    const meanTarget = { kind: "mean" as const, field: "成绩" };
    const emptyProportionTarget = { kind: "proportion" as const, field: "组别", value: "" };
    const finalProportionTarget = { kind: "proportion" as const, field: "选择", value: "其他" };

    const meanQuestion = buildDefaultResearchQuestion("课堂调查", meanTarget);
    const proportionQuestion = resolveResearchQuestionForTargetChange({
        topicName: "课堂调查",
        previousTarget: meanTarget,
        previousQuestion: meanQuestion,
        nextTarget: emptyProportionTarget,
    });
    expect(proportionQuestion).toBe("课堂调查中组别为“目标类别”的单位占比是多少？");

    expect(resolveResearchQuestionForTargetChange({
        topicName: "课堂调查",
        previousTarget: emptyProportionTarget,
        previousQuestion: proportionQuestion,
        nextTarget: finalProportionTarget,
    })).toBe("课堂调查中选择为“其他”的单位占比是多少？");
});

test("custom research questions survive target changes", () => {
    expect(resolveResearchQuestionForTargetChange({
        topicName: "课堂调查",
        previousTarget: { kind: "mean", field: "成绩" },
        previousQuestion: "教师自定义的跨变量研究问题是什么？",
        nextTarget: { kind: "proportion", field: "选择", value: "其他" },
    })).toBe("教师自定义的跨变量研究问题是什么？");
});
