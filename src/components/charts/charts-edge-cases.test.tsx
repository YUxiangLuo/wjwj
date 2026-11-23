import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { ConfidenceIntervalPlot } from "./ConfidenceIntervalPlot";
import { FieldworkFunnelChart } from "./FieldworkFunnelChart";
import { StratumComparisonChart } from "./StratumComparisonChart";
import { WaveDeltaScorecard } from "./WaveDeltaScorecard";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/student").restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function expectNoNumericGarbage(container: HTMLElement) {
    const html = container.innerHTML;
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
}

describe("ConfidenceIntervalPlot adversarial edge cases", () => {
    test("renders distinct ticks and valid SVG coordinates when CI bounds are identical (zero halfWidth / census)", async () => {
        const view = render(
            <ConfidenceIntervalPlot
                title="普查零方差置信区间测试"
                subtitle="上下限完全重合"
                populationValue={50}
                unit="元"
                rows={[
                    {
                        key: "census",
                        label: "普查精确值",
                        sublabel: "N=n=200",
                        estimate: 50,
                        standardError: 0,
                        halfWidth: 0,
                        tone: "success",
                    },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        const tickTexts = [...view.container.querySelectorAll("svg text")].map((node) => node.textContent?.trim());
        expect(tickTexts.length).toBe(5);
        expect(new Set(tickTexts).size).toBe(5);
        expect(view.queryByRole("table", { name: "普查零方差置信区间测试数值明细表" }) !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("handles negative estimates, extreme values, NaN, and Infinity without corrupting SVG", () => {
        const view = render(
            <ConfidenceIntervalPlot
                title="极端值与异常数值森林图"
                populationValue={Number.NaN}
                isPercentage={false}
                unit="分"
                rows={[
                    {
                        key: "neg",
                        label: "负向净推荐值估计",
                        estimate: -18.4,
                        standardError: 2.5,
                        halfWidth: 4.9,
                        tone: "warning",
                    },
                    {
                        key: "bad-hw",
                        label: "半宽异常样本",
                        estimate: -10.2,
                        standardError: Number.NaN,
                        halfWidth: Number.POSITIVE_INFINITY,
                        tone: "primary",
                    },
                    {
                        key: "bad-est",
                        label: "估计值缺失样本",
                        estimate: Number.NaN,
                        standardError: -3,
                        halfWidth: -5,
                        tone: "info",
                    },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        expect(view.queryByText("-18.40分") !== null).toBe(true);
        expect(view.getAllByText("不可用").length).toBeGreaterThanOrEqual(2);
        cleanup();

        const extremeView = render(
            <ConfidenceIntervalPlot
                title="MAX_VALUE 溢出防护测试"
                rows={[
                    { key: "lo", label: "极小值", estimate: -1e308, standardError: 1e308, halfWidth: 1e308 },
                    { key: "hi", label: "极大值", estimate: 1e308, standardError: 1e308, halfWidth: 1e308 },
                ]}
            />,
        );
        expectNoNumericGarbage(extremeView.container);
    });
});

describe("FieldworkFunnelChart adversarial edge cases", () => {
    test("guards zero denominators, empty stages, negative/NaN counts, and out-of-order stage counts", async () => {
        const emptyView = render(<FieldworkFunnelChart stages={[]} />);
        expect(emptyView.queryByText("暂无投放转化漏斗数据") !== null).toBe(true);
        cleanup();

        const view = render(
            <FieldworkFunnelChart
                targetRequiredCount={Number.NaN}
                totalEstimatedCost={Number.POSITIVE_INFINITY}
                unitEffectiveCost={-20}
                stages={[
                    { key: "s1", label: "1. 邀约量为零", count: 0, description: "零分母测试", tone: "primary" },
                    { key: "s2", label: "2. 异常负值输入", count: -5, description: "负值截断测试", tone: "info" },
                    { key: "s3", label: "3. 非有限输入", count: Number.NaN, description: "非有限数值防护", tone: "warning" },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        expect(view.getAllByText(/环比 —/).length).toBe(2);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});

describe("StratumComparisonChart adversarial edge cases", () => {
    test("handles long stratum names, zero invited count, 100% share without clipping, and NaN inputs", async () => {
        const longStratum = "华东旗舰大区_高净值黑金会员_超高频复购重点跟踪核心客群分段_2026Q4专项监控组";
        const view = render(
            <StratumComparisonChart
                stratumField="超长分层字段名称_客群生命周期价值与渠道归属层级"
                rows={[
                    {
                        stratum: longStratum,
                        frameSharePct: 100,
                        invitedCount: 0,
                        validCount: 0,
                        validSharePct: 100,
                        responseRatePct: Number.NaN,
                    },
                    {
                        stratum: "",
                        frameSharePct: Number.NEGATIVE_INFINITY,
                        invitedCount: 20,
                        validCount: 10,
                        validSharePct: Number.POSITIVE_INFINITY,
                        responseRatePct: 50,
                    },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        expect(view.queryByText(longStratum) !== null).toBe(true);
        expect(view.queryByText(/有效回收率 —（0\/0）/) !== null).toBe(true);
        expect(view.queryByText("（未命名层）") !== null).toBe(true);
        const rects = [...view.container.querySelectorAll("svg rect")];
        for (const rect of rects) {
            const width = Number(rect.getAttribute("width"));
            expect(Number.isFinite(width)).toBe(true);
            expect(width).toBeLessThanOrEqual(328);
        }
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});

describe("WaveDeltaScorecard adversarial edge cases", () => {
    test("computes -100% SE reduction when formal wave achieves census SE = 0", async () => {
        const view = render(
            <WaveDeltaScorecard
                firstWave={{
                    waveNumber: 1,
                    label: "第 1 轮",
                    methodLabel: "简单随机抽样",
                    invitedCount: 40,
                    validCount: 28,
                    effectiveRatePct: 70,
                    invalidCleanedCount: 4,
                    maxStratumBiasPp: 8.5,
                    primaryStandardError: 2.4,
                    unitLabel: "分钟",
                }}
                finalWave={{
                    waveNumber: 2,
                    label: "第 2 轮",
                    methodLabel: "分层普查抽样",
                    invitedCount: 200,
                    validCount: 200,
                    effectiveRatePct: 100,
                    invalidCleanedCount: 0,
                    maxStratumBiasPp: 0,
                    primaryStandardError: 0,
                    unitLabel: "分钟",
                }}
            />,
        );

        expectNoNumericGarbage(view.container);
        expect(view.queryByText("-100%") !== null).toBe(true);
        expect(view.queryByText("0.00 分钟") !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});
