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

describe("ConfidenceIntervalPlot ECharts forest plot & adversarial edge cases", () => {
    test("renders distinct ticks, ECharts SVG primitives, and accessible table when CI bounds are identical (zero halfWidth / census)", async () => {
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
                        sampleSize: 200,
                        tone: "success",
                    },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        const echartBox = view.getByTestId("confidence-interval-echart");
        const svg = echartBox.querySelector("svg");
        expect(svg !== null).toBe(true);
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(echartBox.querySelectorAll("svg path").length).toBeGreaterThan(2);

        const unitTickTexts = [...echartBox.querySelectorAll("svg text")]
            .map((node) => node.textContent?.trim() ?? "")
            .filter((text) => text.endsWith("元") && !text.startsWith("总体真值"));
        expect(unitTickTexts.length).toBeGreaterThanOrEqual(3);
        expect(new Set(unitTickTexts).size).toBe(unitTickTexts.length);
        expect(echartBox.textContent).toContain("总体真值 50.00元");

        expect(view.queryByRole("table", { name: "普查零方差置信区间测试数值明细表" }) !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("handles negative estimates, percentage scaling, extreme values, NaN, Infinity, and empty rows without corrupting SVG", async () => {
        const emptyView = render(
            <ConfidenceIntervalPlot
                title="空数据森林图"
                rows={[{ key: "null-row", label: "空估计", estimate: null, standardError: null, halfWidth: null }]}
            />,
        );
        expect(emptyView.queryByText(/完成抽样与问卷回收后将在此展示/) !== null).toBe(true);
        expect(await getAccessibilityViolations(emptyView.container)).toEqual([]);
        cleanup();

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
                        sampleSize: 45,
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
        expect(view.getByTestId("confidence-interval-echart").querySelector("svg") !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
        cleanup();

        const pctView = render(
            <ConfidenceIntervalPlot
                title="比例置信区间森林图"
                populationValue={0.625}
                isPercentage
                rows={[
                    {
                        key: "prop",
                        label: "校准比例估计",
                        estimate: 0.64,
                        standardError: 0.03,
                        halfWidth: 0.0588,
                        sampleSize: 120,
                        tone: "auxiliary",
                    },
                ]}
            />,
        );
        expectNoNumericGarbage(pctView.container);
        expect(pctView.container.textContent).toContain("64.00%");
        expect(pctView.container.textContent).toContain("62.50%");
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

describe("FieldworkFunnelChart ECharts trapezoid funnel + retention breakdown & edge cases", () => {
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
        expect(view.getByTestId("fieldwork-funnel-echart").querySelector("svg") !== null).toBe(true);
        expect(view.getByTestId("fieldwork-retention-echart").querySelector("svg") !== null).toBe(true);
        expect(view.getAllByText(/环比 —/).length).toBe(2);
        expect(view.queryByRole("table", { name: "问卷投放回收质检转化漏斗数据表" }) !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("renders target threshold indicator, cost badges, and drop-off metrics on valid fieldwork pipeline", async () => {
        const view = render(
            <FieldworkFunnelChart
                targetRequiredCount={60}
                totalEstimatedCost={1800}
                unitEffectiveCost={28.1}
                stages={[
                    { key: "s1", label: "1. 入样发放邀约", count: 100, description: "分层抽样名单", tone: "primary" },
                    { key: "s2", label: "2. 成功触达受访者", count: 88, description: "失联 12 份", tone: "info" },
                    { key: "s3", label: "3. 原始完答回收", count: 72, description: "拒访 10 · 弃答 6", tone: "warning" },
                    { key: "s4", label: "4. 质检清洗有效卷", count: 64, description: "剔除闪电卷 8 份", tone: "success" },
                ]}
            />,
        );

        expectNoNumericGarbage(view.container);
        expect(view.container.textContent).toContain("总有效留存率 64.0%");
        expect(view.container.textContent).toContain("规划目标有效量：60 份（已达标）");
        expect(view.container.textContent).toContain("目标 60 份");
        expect(view.container.textContent).toContain("-12 份");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});

describe("StratumComparisonChart ECharts dual-axis composed chart & edge cases", () => {
    test("handles empty strata, long stratum names, zero invited count, 100% share, and NaN inputs", async () => {
        const emptyView = render(<StratumComparisonChart stratumField="客群层级" rows={[]} />);
        expect(emptyView.queryByText("当前课题未配置框内客群分层字段") !== null).toBe(true);
        cleanup();

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
        expect(view.queryAllByText(longStratum).length).toBeGreaterThanOrEqual(1);
        expect(view.queryByText(/有效回收率 —（0\/0）/) !== null).toBe(true);
        expect(view.queryAllByText("（未命名层）").length).toBeGreaterThanOrEqual(2);

        const echartBox = view.getByTestId("stratum-comparison-echart");
        expect(echartBox.querySelector("svg") !== null).toBe(true);
        expect(echartBox.querySelectorAll("svg path").length).toBeGreaterThan(2);
        expect(
            view.queryByRole("table", {
                name: "超长分层字段名称_客群生命周期价值与渠道归属层级细分客群结构偏倚诊断表",
            }) !== null,
        ).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});

describe("WaveDeltaScorecard ECharts multi-wave radar + bar evolution & edge cases", () => {
    test("computes -100% SE reduction when formal wave achieves census SE = 0 and renders radar + grouped bar charts", async () => {
        const view = render(
            <WaveDeltaScorecard
                targetSampleSize={180}
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
        expect(view.getByTestId("wave-delta-radar-echart").querySelector("svg") !== null).toBe(true);
        expect(view.getByTestId("wave-delta-bar-echart").querySelector("svg") !== null).toBe(true);
        expect(view.queryByRole("table", { name: "多轮调研四维质量演进对照表" }) !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });
});
