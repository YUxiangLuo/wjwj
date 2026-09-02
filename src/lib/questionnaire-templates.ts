import type { QuestionnaireData, QuestionSection } from "./questionnaire-types";

export const QUESTION_SECTION_LABELS: Record<QuestionSection, string> = {
    screening: "甄别题",
    main: "主体题",
    background: "背景资料",
};

export interface QuestionnaireTemplate {
    id: string;
    name: string;
    description: string;
    questionnaire: QuestionnaireData;
}

export const QUESTIONNAIRE_TEMPLATES: QuestionnaireTemplate[] = [
    {
        id: "attitude-satisfaction",
        name: "态度与满意度",
        description: "适合课程体验、产品评价和服务满意度等研究。",
        questionnaire: {
            title: "关于相关体验与满意度的调查问卷",
            welcomeText: "<p>您好！本问卷用于了解目标人群的实际体验与满意度，预计用时 3–5 分钟。参与完全自愿，结果仅以汇总形式用于教学研究。</p>",
            endingText: "<p>感谢您的认真参与！您的反馈将帮助我们理解目标人群的体验，并完善后续调查设计。</p>",
            questions: [
                { id: "attitude-1", section: "screening", type: "boolean", content: "您是否在过去三个月内体验过本次调查所指的课程、产品或服务？" },
                { id: "attitude-2", section: "main", type: "scale", content: "您对本次体验的总体满意程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
                { id: "attitude-3", section: "main", type: "scale", content: "您认为本次体验满足实际需求的程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "完全不满足", scaleMaxLabel: "完全满足" },
                { id: "attitude-4", section: "main", type: "multiple", content: "哪些因素最影响您的总体评价？", options: ["内容或功能", "使用过程", "支持服务", "时间成本", "其他"], minSelect: 1, maxSelect: 3 },
                { id: "attitude-5", section: "background", type: "single", content: "您使用或参与相关服务的频率是？", options: ["首次", "偶尔", "每月多次", "每周多次"] },
                { id: "attitude-6", section: "background", type: "single", content: "您所属的主要人群类别是？", options: ["类别一", "类别二", "类别三", "其他/不便回答"] },
            ],
        },
    },
    {
        id: "behavior-habit",
        name: "行为与习惯",
        description: "适合学习、阅读、消费、运动等行为频率研究。",
        questionnaire: {
            title: "关于日常行为与习惯的调查问卷",
            welcomeText: "<p>您好！本问卷用于了解目标人群在明确时间范围内的行为与习惯，预计用时 3–5 分钟。答案仅用于教学研究并以汇总方式分析。</p>",
            endingText: "<p>感谢您的参与！请再次确认答案反映的是题目指定时间范围内的真实情况。</p>",
            questions: [
                { id: "behavior-1", section: "screening", type: "boolean", content: "您是否属于本研究界定的目标人群？" },
                { id: "behavior-2", section: "main", type: "single", content: "过去 30 天内，您平均每周进行目标行为的次数是？", options: ["0 次", "1–2 次", "3–4 次", "5 次及以上"] },
                { id: "behavior-3", section: "main", type: "single", content: "每次进行该行为通常持续多长时间？", options: ["少于 15 分钟", "15–30 分钟", "31–60 分钟", "60 分钟以上"] },
                { id: "behavior-4", section: "main", type: "multiple", content: "通常有哪些因素会影响您进行该行为？", options: ["时间安排", "资源条件", "个人兴趣", "同伴影响", "其他"], minSelect: 1, maxSelect: 3 },
                { id: "behavior-5", section: "main", type: "scale", content: "您保持该行为的稳定程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不稳定", scaleMaxLabel: "非常稳定" },
                { id: "behavior-6", section: "background", type: "single", content: "您所属的主要人群类别是？", options: ["类别一", "类别二", "类别三", "其他/不便回答"] },
            ],
        },
    },
    {
        id: "public-service",
        name: "公共服务与需求",
        description: "适合校园设施、公共管理和服务改进调查。",
        questionnaire: {
            title: "关于公共服务使用体验与需求的调查问卷",
            welcomeText: "<p>您好！本问卷用于了解目标人群对相关公共服务的使用体验和改进需求。参与完全自愿，不收集与研究无关的身份信息。</p>",
            endingText: "<p>感谢您的反馈！调查结果将以汇总形式用于教学分析和服务改进讨论。</p>",
            questions: [
                { id: "service-1", section: "screening", type: "boolean", content: "过去三个月内，您是否使用过本次调查所指的公共服务？" },
                { id: "service-2", section: "main", type: "single", content: "您使用该服务的频率是？", options: ["仅 1 次", "每月少于 1 次", "每月 1–3 次", "每周至少 1 次"] },
                { id: "service-3", section: "main", type: "scale", content: "您对该服务整体质量的满意程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
                { id: "service-4", section: "main", type: "multiple", content: "您认为最需要优先改进哪些方面？", options: ["可获得性", "办理效率", "信息清晰度", "人员服务", "设施条件", "其他"], minSelect: 1, maxSelect: 3 },
                { id: "service-5", section: "main", type: "scale", content: "该服务满足您实际需求的程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "完全不满足", scaleMaxLabel: "完全满足" },
                { id: "service-6", section: "background", type: "single", content: "您与该服务相关的身份类别是？", options: ["类别一", "类别二", "类别三", "其他/不便回答"] },
            ],
        },
    },
];
