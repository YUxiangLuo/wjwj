import { expect, test } from "bun:test";
import {
    COMMON_SCALE_QUESTION_TEMPLATES,
    createQuestionFromRecommendQuestion,
    createQuestionFromScaleTemplate,
    evaluateQuestionnaireDesign,
} from "./questionnaire-assistant";

test("recommend scale questions keep their scale labels when converted", () => {
    const question = createQuestionFromRecommendQuestion({
        id: 1,
        questionType: 4,
        content: "我愿意继续使用该服务。",
        options: ["非常不同意", "非常同意"],
        sortOrder: 1,
    });

    expect(question.type).toBe("scale");
    expect(question.scaleMin).toBe(1);
    expect(question.scaleMax).toBe(5);
    expect(question.scaleMinLabel).toBe("非常不同意");
    expect(question.scaleMaxLabel).toBe("非常同意");
});

test("common scale templates create reusable scale questions", () => {
    const created = createQuestionFromScaleTemplate(COMMON_SCALE_QUESTION_TEMPLATES[0]!);

    expect(created.id).toStartWith("q_");
    expect(created.type).toBe("scale");
    expect(created.scaleMinLabel).toBeTruthy();
    expect(created.scaleMaxLabel).toBeTruthy();
});

test("questionnaire evaluation rewards complete scale-based structure", () => {
    const summary = evaluateQuestionnaireDesign({
        title: "社区服务满意度调查",
        welcomeText: "您好！本问卷用于了解社区服务满意度，预计耗时 3 分钟，问卷匿名填写，结果仅用于教学研究分析。",
        endingText: "问卷填写完毕，感谢您的参与。如有补充意见，可在课后反馈给教师。",
        questions: [
            { id: "q1", type: "single", content: "您最近半年是否使用过社区服务？", options: ["是", "否"] },
            { id: "q2", type: "single", content: "您最常使用哪类社区服务？", options: ["便民服务", "文化活动", "健康服务"] },
            { id: "q3", type: "scale", content: "请评价社区服务的响应速度。", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
            { id: "q4", type: "scale", content: "请评价社区服务人员的专业程度。", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
            { id: "q5", type: "multiple", content: "您希望优先改进哪些方面？", options: ["服务效率", "信息透明", "服务态度"], minSelect: 1, maxSelect: 2 },
            { id: "q6", type: "boolean", content: "您是否愿意向他人推荐社区服务？" },
        ],
    });

    expect(summary.preliminaryScore).toBeGreaterThanOrEqual(85);
    expect(summary.scaleQuestionCount).toBe(2);
    expect(summary.items.some((item) => item.label === "量表题配置" && item.status === "pass")).toBe(true);
});
