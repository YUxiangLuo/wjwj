import { expect, test } from "bun:test";

import { buildRecommendedFieldMapping } from "./mapping-recommendation";

test("mapping recommendation never treats categorical satisfaction labels as numeric", () => {
    const preview = [
        { 编号: "D001", 校区: "东区", 满意类别: "满意", 学习分钟: 42, 规模权重: 120 },
        { 编号: "D002", 校区: "西区", 满意类别: "一般", 学习分钟: 35, 规模权重: 95 },
        { 编号: "D003", 校区: "东区", 满意类别: "不满意", 学习分钟: 51, 规模权重: 140 },
    ];

    const result = buildRecommendedFieldMapping({
        columns: ["编号", "校区", "满意类别", "学习分钟", "规模权重"],
        preview,
        topicName: "学习体验",
    });

    expect(result.numeric).toEqual(["学习分钟", "规模权重"]);
    expect(result.stratified).toEqual(["校区", "满意类别"]);
    expect(result.analysisTarget).toEqual({ kind: "mean", field: "学习分钟" });
    expect(result.studyContract?.target).toEqual({ kind: "mean", field: "学习分钟" });
});

test("mapping recommendation still recognizes a numeric satisfaction score", () => {
    const result = buildRecommendedFieldMapping({
        columns: ["id", "性别", "满意度评分"],
        preview: [
            { id: "A1", 性别: "女", 满意度评分: 4 },
            { id: "A2", 性别: "男", 满意度评分: 5 },
            { id: "A3", 性别: "女", 满意度评分: 3 },
        ],
        topicName: "满意度研究",
    });

    expect(result.numeric).toEqual(["满意度评分"]);
    expect(result.analysisTarget).toEqual({ kind: "mean", field: "满意度评分" });
});

test("mapping recommendation leaves numeric fields empty when the data is entirely categorical", () => {
    const result = buildRecommendedFieldMapping({
        columns: ["编号", "地区", "满意类别"],
        preview: [
            { 编号: "A1", 地区: "华东", 满意类别: "满意" },
            { 编号: "A2", 地区: "华南", 满意类别: "一般" },
            { 编号: "A3", 地区: "华东", 满意类别: "不满意" },
        ],
        topicName: "分类研究",
    });

    expect(result.numeric).toEqual([]);
    expect(result.analysisTarget).toBeUndefined();
    expect(result.studyContract).toBeUndefined();
});

test("mapping recommendation supports an identifier plus a mean outcome without inventing strata", () => {
    const result = buildRecommendedFieldMapping({
        columns: ["编号", "测量值"],
        preview: [
            { 编号: "M1", 测量值: 10 },
            { 编号: "M2", 测量值: 20 },
            { 编号: "M3", 测量值: 30 },
        ],
        topicName: "两字段均值研究",
    });

    expect(result.identifier).toBe("编号");
    expect(result.numeric).toEqual(["测量值"]);
    expect(result.stratified).toEqual([]);
    expect(result.studyContract?.target).toEqual({ kind: "mean", field: "测量值" });
});

test("mapping recommendation follows the topic outcome instead of the first numeric column", () => {
    const columns = ["id", "respondent_id", "age", "gender", "education", "occupation", "monthly_income", "province", "city_tier", "major", "marital_status", "monthly_spending", "purchase_frequency", "satisfaction", "nps_score", "platform_preference"];
    const preview = [
        { id: "1", respondent_id: "R1", age: 19, gender: "女", education: "本科", occupation: "学生", monthly_income: 2200, province: "北京", city_tier: "一线", major: "统计学", marital_status: "未婚", monthly_spending: 980, purchase_frequency: 6, satisfaction: 4, nps_score: 8, platform_preference: "淘宝" },
        { id: "2", respondent_id: "R2", age: 24, gender: "男", education: "硕士", occupation: "职员", monthly_income: 5200, province: "上海", city_tier: "一线", major: "经济学", marital_status: "已婚", monthly_spending: 2400, purchase_frequency: 12, satisfaction: 5, nps_score: 9, platform_preference: "京东" },
        { id: "3", respondent_id: "R3", age: 31, gender: "女", education: "博士", occupation: "教师", monthly_income: 8100, province: "广东", city_tier: "新一线", major: "社会学", marital_status: "已婚", monthly_spending: 3600, purchase_frequency: 9, satisfaction: 3, nps_score: 7, platform_preference: "拼多多" },
    ];

    const result = buildRecommendedFieldMapping({ columns, preview, topicName: "联动走查：月消费支出" });

    expect(result.analysisTarget).toEqual({ kind: "mean", field: "monthly_spending" });
    expect(result.numeric[0]).toBe("monthly_spending");
});

test("mapping recommendation keeps age as the target only when the topic is about age", () => {
    const columns = ["id", "age", "satisfaction_score"];
    const preview = [
        { id: "1", age: 19, satisfaction_score: 4 },
        { id: "2", age: 24, satisfaction_score: 5 },
        { id: "3", age: 31, satisfaction_score: 3 },
    ];

    expect(buildRecommendedFieldMapping({ columns, preview, topicName: "顾客年龄结构分析" }).analysisTarget).toEqual({ kind: "mean", field: "age" });
    expect(buildRecommendedFieldMapping({ columns, preview, topicName: "顾客满意度研究" }).analysisTarget).toEqual({ kind: "mean", field: "satisfaction_score" });
});

test("mapping recommendation rejects mixed and blank values even when the field name sounds numeric", () => {
    const result = buildRecommendedFieldMapping({
        columns: ["编号", "地区", "满意度分数"],
        preview: [
            { 编号: "A1", 地区: "华东", 满意度分数: 4 },
            { 编号: "A2", 地区: "华南", 满意度分数: "" },
            { 编号: "A3", 地区: "华东", 满意度分数: "未知" },
        ],
        topicName: "混合值研究",
    });

    expect(result.numeric).toEqual([]);
    expect(result.analysisTarget).toBeUndefined();
});
