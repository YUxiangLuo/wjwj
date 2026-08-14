import { expect, test } from "bun:test";
import { pickDefaultPpsSizeField } from "./pps-size-field";

test("pickDefaultPpsSizeField prefers a size-like name over mapping order", () => {
    expect(pickDefaultPpsSizeField(["每周学习时长", "月生活费", "学习满意度"])).toBe("月生活费");
    expect(pickDefaultPpsSizeField(["每周学习时长", "月消费", "学习满意度"])).toBe("月消费");
    expect(pickDefaultPpsSizeField(["age", "monthly_income", "satisfaction"])).toBe("monthly_income");
    expect(pickDefaultPpsSizeField(["age", "monthly_spending"])).toBe("monthly_spending");
    expect(pickDefaultPpsSizeField(["年龄", "每周学习时长"])).toBe("年龄");
    expect(pickDefaultPpsSizeField([])).toBe("");
});

test("pickDefaultPpsSizeField prefers size names over weight fields", () => {
    expect(pickDefaultPpsSizeField(["抽样权重", "月生活费"])).toBe("月生活费");
    expect(pickDefaultPpsSizeField(["sampling_weight", "monthly_income"])).toBe("monthly_income");
    expect(pickDefaultPpsSizeField(["年龄", "抽样权重"])).toBe("抽样权重");
});
