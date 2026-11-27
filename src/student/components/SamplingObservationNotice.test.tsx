import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SamplingObservationNotice } from "./SamplingObservationNotice";

test("planning response rate never claims to remove nonresponse bias and scopes notice to full-invited benchmark", () => {
    const html = renderToStaticMarkup(<SamplingObservationNotice nonResponseRate={0.2} />);
    const zeroHtml = renderToStaticMarkup(<SamplingObservationNotice nonResponseRate={0} />);

    expect(html).toContain("完整入样基准对照");
    expect(html).toContain("20% 无回答率只用于发放量与预期完成量的情景计算");
    expect(html).toContain("不能单独证明无回答偏差已经消除");
    expect(html).toContain("不能保证样本无偏或具有代表性");
    expect(html).not.toContain("执行和分析不模拟拒访");

    expect(zeroHtml).toContain("完整入样基准对照");
    expect(zeroHtml).not.toContain("执行和分析不模拟拒访");
});
