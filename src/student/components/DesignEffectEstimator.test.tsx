import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignEffectEstimator } from "./DesignEffectEstimator";

test("设计效应检查器不再输出无来源的方法默认值和调查方式回答率", () => {
    const html = renderToStaticMarkup(
        <DesignEffectEstimator currentDeff={1.3} onDeffChange={() => {}} />,
    );

    expect(html).toContain("抽样方法名称不能自动推出设计效应");
    expect(html).toContain("当前假设 deff = 1.3");
    expect(html).toContain("历史方差，或用预调查/设计模拟");
    expect(html).not.toContain("0.7-0.9");
    expect(html).not.toContain("20%-40%");
    expect(html).not.toContain("参数建议");
});
