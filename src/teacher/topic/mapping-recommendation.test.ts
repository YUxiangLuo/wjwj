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
