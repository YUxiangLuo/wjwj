import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { useRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { EChartBox, exportEChartSvg } from "./EChartBox";
import type { ECElementEvent, ECharts, EChartsCoreOption, ExecutiveChartOption } from "./echarts-core";
import {
    EXECUTIVE_CHART_FALLBACK_TOKENS,
    EXECUTIVE_TOOLTIP_EXTRA_CSS,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    resolveChartToneColor,
} from "./echarts-theme";

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

describe("Executive BI ECharts theme helpers", () => {
    test("returns theme.css hex fallbacks in HappyDOM and respects live CSS custom properties when set", () => {
        const fallbackTokens = getExecutiveChartTokens();
        expect(fallbackTokens.chart1).toBe(EXECUTIVE_CHART_FALLBACK_TOKENS.chart1);
        expect(fallbackTokens.chart2).toBe("#0b57d0");
        expect(fallbackTokens.primary).toBe("#0b57d0");
        expect(fallbackTokens.success).toBe("#146c2e");
        expect(fallbackTokens.warning).toBe("#8c4a00");
        expect(fallbackTokens.info).toBe("#00639b");
        expect(fallbackTokens.destructive).toBe("#b3261e");
        expect(fallbackTokens.auxiliary).toBe("#65558f");
        expect(fallbackTokens.foreground).toBe("#1f1f1f");
        expect(fallbackTokens.mutedForeground).toBe("#444746");
        expect(fallbackTokens.popover).toBe("#ffffff");
        expect(fallbackTokens.border).toBe("#dde3ea");
        expect(fallbackTokens.chartSeries.length).toBe(8);
        expect(resolveChartToneColor("primary", fallbackTokens)).toBe("#0b57d0");
        expect(resolveChartToneColor("success", fallbackTokens)).toBe("#146c2e");

        document.documentElement.style.setProperty("--chart-2", "#123456");
        try {
            const liveTokens = getExecutiveChartTokens();
            expect(liveTokens.chart2).toBe("#123456");
            expect(liveTokens.palette[0]).toBe("#123456");
        } finally {
            document.documentElement.style.removeProperty("--chart-2");
        }

        const tooltip = buildExecutiveTooltip();
        expect(tooltip.extraCssText).toBe(EXECUTIVE_TOOLTIP_EXTRA_CSS);
        expect(tooltip.backgroundColor).toBe("#ffffff");
        expect(tooltip.borderColor).toBe("#dde3ea");

        const valueAxis = buildExecutiveValueAxis({ name: "有效样本量" });
        expect(valueAxis.name).toBe("有效样本量");
        expect((valueAxis.splitLine as { lineStyle?: { type?: string } }).lineStyle?.type).toBe("dashed");
        expect((valueAxis.axisLine as { show?: boolean }).show).toBe(false);

        const categoryAxis = buildExecutiveCategoryAxis({ data: ["华东", "华北", "华南"] });
        expect((categoryAxis.axisTick as { show?: boolean }).show).toBe(false);
        expect((categoryAxis.splitLine as { show?: boolean }).show).toBe(false);

        const legend = buildExecutiveLegend();
        expect(legend.icon).toBe("roundRect");
    });
});

describe("EChartBox SVG rendering, accessibility, export, and lifecycle", () => {
    test("renders Bar + Line + MarkLine option as crisp SVG in HappyDOM with fallbackWidth and passes axe-core", async () => {
        const chartRef = { current: null as ECharts | null };
        const option: ExecutiveChartOption = {
            grid: buildExecutiveGrid(),
            tooltip: buildExecutiveTooltip(),
            legend: buildExecutiveLegend({ data: ["框内占比", "有效回收占比"] }),
            xAxis: buildExecutiveCategoryAxis({ data: ["高价值客群", "成长型客群", "沉睡客群"] }),
            yAxis: buildExecutiveValueAxis({ max: 100 }),
            series: [
                {
                    name: "框内占比",
                    type: "bar",
                    data: [35, 45, 20],
                    markLine: {
                        silent: true,
                        data: [{ yAxis: 33.3, name: "均衡基准" }],
                    },
                },
                {
                    name: "有效回收占比",
                    type: "line",
                    data: [38, 44, 18],
                    markPoint: {
                        data: [{ type: "max", name: "最高占比" }],
                    },
                    markArea: {
                        silent: true,
                        data: [[{ yAxis: 25 }, { yAxis: 45 }]],
                    },
                },
            ],
        };

        const view = render(
            <EChartBox
                option={option}
                height={300}
                fallbackWidth={680}
                ariaLabel="客群分层框内占比与有效回收占比对比图"
                testId="stratum-echart-box"
                chartRef={chartRef}
                srSummary={
                    <table aria-label="客群分层对比数据表">
                        <thead>
                            <tr>
                                <th scope="col">分层</th>
                                <th scope="col">框内占比</th>
                                <th scope="col">有效回收占比</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">高价值客群</th>
                                <td>35%</td>
                                <td>38%</td>
                            </tr>
                        </tbody>
                    </table>
                }
            />,
        );

        const wrapper = view.getByTestId("stratum-echart-box");
        expect(wrapper !== null).toBe(true);

        const figure = view.getByRole("img", { name: "客群分层框内占比与有效回收占比对比图" });
        expect(figure !== null).toBe(true);

        const svg = wrapper.querySelector("svg");
        expect(svg !== null).toBe(true);
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(svg?.getAttribute("focusable")).toBe("false");
        expect(wrapper.querySelectorAll("svg path").length).toBeGreaterThan(2);

        expect(chartRef.current !== null).toBe(true);
        expect(chartRef.current?.getWidth()).toBe(680);
        expect(chartRef.current?.getHeight()).toBe(300);

        const exportedSvg = exportEChartSvg(chartRef.current);
        expect(typeof exportedSvg).toBe("string");
        expect(exportedSvg?.startsWith("<svg")).toBe(true);
        expect(exportedSvg?.includes("高价值客群")).toBe(true);

        expect(view.queryByRole("table", { name: "客群分层对比数据表" }) !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("renders Boxplot, Funnel, and Custom series options cleanly via SVG renderer", async () => {
        const boxplotOption: ExecutiveChartOption = {
            grid: buildExecutiveGrid(),
            xAxis: buildExecutiveCategoryAxis({ data: ["首轮试投", "正式投放"] }),
            yAxis: buildExecutiveValueAxis(),
            series: [
                {
                    name: "作答时长分布",
                    type: "boxplot",
                    data: [
                        [42, 68, 95, 132, 190],
                        [55, 78, 102, 128, 168],
                    ],
                },
                {
                    name: "离群点",
                    type: "scatter",
                    data: [[0, 245]],
                },
            ],
        };

        const funnelOption: ExecutiveChartOption = {
            tooltip: buildExecutiveTooltip({ trigger: "item" }),
            series: [
                {
                    name: "外勤转化漏斗",
                    type: "funnel",
                    data: [
                        { name: "抽样邀约", value: 200 },
                        { name: "成功触达", value: 168 },
                        { name: "完整提交", value: 142 },
                        { name: "质检有效", value: 128 },
                    ],
                },
            ],
        };

        const customCiOption: EChartsCoreOption = {
            grid: buildExecutiveGrid(),
            xAxis: buildExecutiveValueAxis({ min: 40, max: 80 }),
            yAxis: buildExecutiveCategoryAxis({ data: ["简单随机抽样", "分层比例抽样"] }),
            series: [
                {
                    name: "95% 置信区间",
                    type: "custom",
                    renderItem: (_params: unknown, api: { value: (idx: number) => number; coord: (pt: [number, number]) => [number, number] }) => {
                        const categoryIndex = api.value(0);
                        const low = api.coord([api.value(1), categoryIndex]);
                        const high = api.coord([api.value(2), categoryIndex]);
                        const est = api.coord([api.value(3), categoryIndex]);
                        return {
                            type: "group",
                            children: [
                                {
                                    type: "line",
                                    shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] },
                                    style: { stroke: "#175cd3", lineWidth: 2.5 },
                                },
                                {
                                    type: "circle",
                                    shape: { cx: est[0], cy: est[1], r: 5 },
                                    style: { fill: "#175cd3", stroke: "#ffffff", lineWidth: 1.5 },
                                },
                            ],
                        };
                    },
                    encode: { x: [1, 2, 3], y: 0 },
                    data: [
                        [0, 52.4, 64.8, 58.6],
                        [1, 56.1, 61.9, 59.0],
                    ],
                },
            ],
        };

        const view = render(
            <div>
                <EChartBox option={boxplotOption} ariaLabel="作答时长箱线图" testId="box-chart" />
                <EChartBox option={funnelOption} ariaLabel="外勤转化漏斗图" testId="funnel-chart" />
                <EChartBox option={customCiOption} ariaLabel="多口径置信区间森林图" testId="custom-chart" />
            </div>,
        );

        for (const id of ["box-chart", "funnel-chart", "custom-chart"]) {
            const box = view.getByTestId(id);
            const svg = box.querySelector("svg");
            expect(svg !== null).toBe(true);
            expect(svg?.getAttribute("aria-hidden")).toBe("true");
            expect(box.querySelectorAll("svg path").length).toBeGreaterThan(0);
            expect(box.innerHTML).not.toContain("NaN");
        }

        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("supports Pie, Dataset, MarkPoint, MarkArea, Radar, ResizeObserver guard/updates, click events, and unmount disposal", async () => {
        let resizeCallback: ResizeObserverCallback | null = null;
        let disconnected = false;
        const OriginalResizeObserver = globalThis.ResizeObserver;

        // First verify graceful fallback when ResizeObserver is undefined
        (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = undefined;
        const pieDatasetOption: ExecutiveChartOption = {
            dataset: {
                source: [
                    ["status", "count"],
                    ["有效样本", 128],
                    ["质检剔除", 14],
                ],
            },
            series: [
                {
                    type: "pie",
                    radius: ["45%", "72%"],
                },
            ],
        };
        const noRoView = render(
            <EChartBox option={pieDatasetOption} ariaLabel="样本质检结构环形图" testId="pie-no-ro" />,
        );
        expect(noRoView.getByTestId("pie-no-ro").querySelector("svg") !== null).toBe(true);
        expect(await getAccessibilityViolations(noRoView.container)).toEqual([]);
        noRoView.unmount();

        class MockResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback;
            }
            observe() {}
            unobserve() {}
            disconnect() {
                disconnected = true;
            }
        }

        globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

        try {
            let capturedInstance: ECharts | null = null;
            const clickedEvents: unknown[] = [];

            function Harness({ height, metricValue }: { height: number; metricValue: number }) {
                const ref = useRef<ECharts | null>(null);
                const radarOption: ExecutiveChartOption = {
                    radar: {
                        indicator: [
                            { name: "覆盖均衡度", max: 100 },
                            { name: "有效回收率", max: 100 },
                            { name: "精度提升", max: 100 },
                        ],
                    },
                    series: [
                        {
                            type: "radar",
                            data: [{ value: [metricValue, 76, 88], name: "正式波次" }],
                        },
                    ],
                };

                return (
                    <EChartBox
                        option={radarOption}
                        height={height}
                        fallbackWidth={520}
                        ariaLabel="波次质量雷达图"
                        chartRef={ref}
                        onChartClick={(params) => {
                            clickedEvents.push(params);
                        }}
                        srSummary={
                            <button
                                type="button"
                                onClick={() => {
                                    capturedInstance = ref.current;
                                }}
                            >
                                读取实例
                            </button>
                        }
                    />
                );
            }

            const view = render(<Harness height={260} metricValue={82} />);
            view.getByRole("button", { name: "读取实例" }).click();

            expect(capturedInstance !== null).toBe(true);
            const activeInstance = capturedInstance!;
            expect(activeInstance.getWidth()).toBe(520);
            expect(activeInstance.getHeight()).toBe(260);

            const runResize = resizeCallback as ResizeObserverCallback | null;
            expect(runResize !== null).toBe(true);
            runResize!(
                [{ contentRect: { width: 840, height: 260 } } as unknown as ResizeObserverEntry],
                {} as ResizeObserver,
            );
            expect(activeInstance.getWidth()).toBe(840);
            expect(view.container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

            view.rerender(<Harness height={340} metricValue={91} />);
            expect(activeInstance.getHeight()).toBe(340);

            activeInstance.trigger("click", { name: "正式波次" } as unknown as ECElementEvent);
            expect(clickedEvents.length).toBe(1);

            view.unmount();
            expect(disconnected).toBe(true);
            expect(activeInstance.isDisposed()).toBe(true);
            expect(exportEChartSvg(activeInstance)).toBeNull();
            expect(exportEChartSvg(null)).toBeNull();
        } finally {
            globalThis.ResizeObserver = OriginalResizeObserver;
        }
    });

    test("exportEChartSvg renders final static geometry even when called at t=0ms during entrance animation, and falls back for mock stubs", () => {
        const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(navigator, "userAgent");
        Object.defineProperty(navigator, "userAgent", {
            value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
            configurable: true,
        });

        try {
            const animatedRef = { current: null as ECharts | null };
            const staticRef = { current: null as ECharts | null };
            const baseOption: ExecutiveChartOption = {
                grid: buildExecutiveGrid(),
                xAxis: buildExecutiveCategoryAxis({ data: ["简单随机", "分层抽样", "PPS抽样"] }),
                yAxis: buildExecutiveValueAxis({ min: 0, max: 30 }),
                series: [
                    {
                        name: "样本点估计",
                        type: "bar",
                        data: [20.9, 20.75, 20.66],
                        markLine: {
                            silent: true,
                            symbol: "none",
                            data: [{ yAxis: 20.72, name: "总体真值" }],
                        },
                    },
                ],
            };

            const view = render(
                <div>
                    <EChartBox
                        option={{ ...baseOption, animation: true, animationDuration: 1000 }}
                        height={440}
                        fallbackWidth={960}
                        ariaLabel="动画入场中的放大均值对比图"
                        chartRef={animatedRef}
                    />
                    <EChartBox
                        option={{ ...baseOption, animation: false, animationDuration: 0 }}
                        height={440}
                        fallbackWidth={960}
                        ariaLabel="静止终态对照图"
                        chartRef={staticRef}
                    />
                </div>,
            );

            expect(animatedRef.current).not.toBeNull();
            expect(staticRef.current).not.toBeNull();

            // At t=0ms, direct renderToSVGString() on the animating instance captures mid-flight incomplete bars/markLine
            const normalizeZrClasses = (svg: string | null) => svg?.replace(/\bzr\d+-cls-\d+\b/g, "zr-cls") ?? null;
            const rawMidAnimationSvg = normalizeZrClasses(animatedRef.current!.renderToSVGString());
            const expectedStaticSvg = normalizeZrClasses(exportEChartSvg(staticRef.current));
            const exportedImmediateSvg = normalizeZrClasses(exportEChartSvg(animatedRef.current));

            expect(expectedStaticSvg !== null).toBe(true);
            expect(rawMidAnimationSvg).not.toBe(expectedStaticSvg);
            expect(exportedImmediateSvg).toBe(expectedStaticSvg);

            // Standalone mock ECharts stub (not in WeakMap) falls back to instance.renderToSVGString()
            const mockStub = {
                isDisposed: () => false,
                renderToSVGString: () => '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
            } as unknown as ECharts;
            expect(exportEChartSvg(mockStub)).toContain("<rect");

            view.unmount();
        } finally {
            if (originalUserAgentDescriptor) {
                Object.defineProperty(navigator, "userAgent", originalUserAgentDescriptor);
            } else {
                Object.defineProperty(navigator, "userAgent", { value: "HappyDOM", configurable: true });
            }
        }
    });
});
