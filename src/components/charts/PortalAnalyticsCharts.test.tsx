import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { echarts } from "./echarts-core";
import {
    AdminPlatformOverviewCharts,
    GradeRubricRadarBarCard,
    GradeScoreHistogramCard,
    GradeSubmissionFunnelCard,
    TaskProgressExecutiveCharts,
    TeacherActiveTasksStructureCard,
    resolveHistogramMarkLineAlign,
    type TaskProgressFilterValue,
} from "./PortalAnalyticsCharts";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

describe("PortalAnalyticsCharts ECharts SVG rendering, interactions, edge cases & axe-core", () => {
    test("TaskProgressExecutiveCharts renders 9-bucket Donut + Pipeline Bar with aria contract, click-to-filter, and 0 a11y violations", async () => {
        const selectedFilters: TaskProgressFilterValue[] = [];
        const counts = {
            not_started: 2,
            stage1: 3,
            stage2: 2,
            stage3: 1,
            stage4: 4,
            stage5: 1,
            submitted: 3,
            graded: 6,
            rejected: 1,
        };

        const view = render(
            <TaskProgressExecutiveCharts
                counts={counts}
                statusFilter="all"
                onSelectStatusFilter={(next) => {
                    selectedFilters.push(next);
                }}
            />,
        );

        const root = view.container.querySelector("#teacher-progress-charts");
        expect(root !== null).toBe(true);

        const donutImg = view.getByRole("img", { name: "学生实验状态分布环形图" });
        expect(donutImg !== null).toBe(true);

        const donutBox = view.getByTestId("teacher-progress-donut-chart");
        const pipelineBox = view.getByTestId("teacher-progress-pipeline-chart");
        expect(donutBox.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(pipelineBox.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(donutBox.querySelectorAll("svg path").length).toBeGreaterThan(5);
        expect(pipelineBox.querySelectorAll("svg path").length).toBeGreaterThan(5);
        expect(view.container.innerHTML).not.toContain("NaN");

        const stage4Pill = view.getByRole("button", { name: /阶段 4 · 调整思路与二轮投放/ });
        fireEvent.click(stage4Pill);
        expect(selectedFilters).toEqual(["stage4"]);

        expect(await getAccessibilityViolations(view.container)).toEqual([]);

        view.rerender(
            <TaskProgressExecutiveCharts
                counts={counts}
                statusFilter="stage4"
                onSelectStatusFilter={(next) => {
                    selectedFilters.push(next);
                }}
            />,
        );
        expect(view.getByText(/已筛选：阶段 4 · 调整思路与二轮投放/) !== null).toBe(true);
        fireEvent.click(view.getByRole("button", { name: "重置" }));
        expect(selectedFilters.at(-1)).toBe("all");
    });

    test("GradeExport Funnel, Score Histogram (including identical mean/median MarkLine), and Rubric Radar+Bar handle full and empty data cleanly", async () => {
        const view = render(
            <div>
                <GradeSubmissionFunnelCard
                    funnel={{
                        total: 30,
                        notStarted: 3,
                        inProgress: 7,
                        pendingGrading: 5,
                        graded: 13,
                        rejected: 2,
                    }}
                />
                <GradeScoreHistogramCard
                    scores={{
                        count: 13,
                        average: 84.6,
                        median: 85.0,
                        componentAverages: {
                            questionnaire: 86.2,
                            process: 83.4,
                            report: 84.1,
                        },
                        bands: [
                            { label: "<60", count: 1 },
                            { label: "60–69", count: 2 },
                            { label: "70–79", count: 3 },
                            { label: "80–89", count: 5 },
                            { label: "90–100", count: 2 },
                        ],
                    }}
                />
                <GradeRubricRadarBarCard
                    scores={{
                        count: 13,
                        average: 84.6,
                        median: 85.0,
                        componentAverages: {
                            questionnaire: 86.2,
                            process: 83.4,
                            report: 84.1,
                        },
                        bands: [],
                    }}
                />
            </div>,
        );

        for (const testId of [
            "teacher-grade-funnel-chart",
            "teacher-grade-score-histogram",
            "teacher-grade-rubric-radar",
            "teacher-grade-rubric-bars",
        ]) {
            const box = view.getByTestId(testId);
            expect(box.querySelector("svg") !== null).toBe(true);
            expect(box.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
            expect(box.querySelectorAll("svg path").length).toBeGreaterThan(0);
        }
        expect(view.container.innerHTML).not.toContain("NaN");
        expect(view.getAllByText("86.2 分").length).toBeGreaterThanOrEqual(1);
        expect(resolveHistogramMarkLineAlign(98.5)).toBe("right");
        expect(resolveHistogramMarkLineAlign(52.0)).toBe("left");
        expect(resolveHistogramMarkLineAlign(84.6)).toBe("center");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);

        // Verify empty / all-null scores render "—" in tiles and never "0.0 分" or NaN
        const emptyView = render(
            <div>
                <GradeSubmissionFunnelCard
                    funnel={{
                        total: 0,
                        notStarted: 0,
                        inProgress: 0,
                        pendingGrading: 0,
                        graded: 0,
                        rejected: 0,
                    }}
                />
                <GradeScoreHistogramCard
                    scores={{
                        count: 0,
                        average: null,
                        median: null,
                        componentAverages: {
                            questionnaire: null,
                            process: null,
                            report: null,
                        },
                        bands: [],
                    }}
                />
                <GradeRubricRadarBarCard
                    scores={{
                        count: 0,
                        average: null,
                        median: null,
                        componentAverages: {
                            questionnaire: null,
                            process: null,
                            report: null,
                        },
                        bands: [],
                    }}
                />
            </div>,
        );
        expect(emptyView.container.innerHTML).not.toContain("NaN");
        expect(emptyView.queryByText("0.0 分") === null).toBe(true);
        expect(emptyView.getAllByText("—").length).toBe(3);
        expect(await getAccessibilityViolations(emptyView.container)).toEqual([]);
    });

    test("TeacherActiveTasksStructureCard toggles 100% stacked vs count mode and AdminPlatformOverviewCharts handles zero/populated stats", async () => {
        const onSelectTask = mock(() => undefined);
        const view = render(
            <div>
                <TeacherActiveTasksStructureCard
                    activeTasks={[
                        {
                            id: 11,
                            templateName: "校园精品咖啡馆选址与消费意愿调研",
                            className: "2026级商务统计1班",
                            deadline: "2026-12-20T12:00:00.000Z",
                            total: 24,
                            completed: 14,
                            pending: 5,
                            rejected: 2,
                        },
                        {
                            id: 12,
                            templateName: "新能源汽车充电服务满意度追踪",
                            className: "2026级市场研究2班",
                            deadline: null,
                            total: 20,
                            completed: 8,
                            pending: 3,
                            rejected: 0,
                        },
                    ]}
                    onSelectTask={onSelectTask}
                />
                <AdminPlatformOverviewCharts
                    stats={{
                        currentSemester: "2026-2027-1",
                        teacherCount: 4,
                        classCount: 6,
                        studentCount: 120,
                        pendingItems: 9,
                    }}
                />
            </div>,
        );

        expect(view.getByTestId("teacher-dashboard-tasks-echart").querySelector("svg") !== null).toBe(true);
        expect(view.getByTestId("admin-dashboard-resource-chart").querySelector("svg") !== null).toBe(true);
        expect(view.getByTestId("admin-dashboard-role-chart").querySelector("svg") !== null).toBe(true);
        expect(view.getByText("20.0 人/班") !== null).toBe(true);
        expect(view.getByText("1 : 30.0") !== null).toBe(true);

        fireEvent.click(view.getByRole("button", { name: "学生人数对比" }));
        expect(view.getByRole("button", { name: "学生人数对比" }).getAttribute("aria-pressed")).toBe("true");
        expect(view.container.innerHTML).not.toContain("NaN");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);

        const zeroAdminView = render(
            <AdminPlatformOverviewCharts
                stats={{
                    currentSemester: "",
                    teacherCount: 0,
                    classCount: 0,
                    studentCount: 0,
                    pendingItems: 0,
                }}
            />,
        );
        expect(zeroAdminView.container.innerHTML).not.toContain("NaN");
        expect(zeroAdminView.getByText("队列已清空") !== null).toBe(true);
        expect(await getAccessibilityViolations(zeroAdminView.container)).toEqual([]);
    });

    test("TeacherActiveTasksStructureCard distinguishes same-template tasks across similar-prefix class names on Y-axis", () => {
        const view = render(
            <TeacherActiveTasksStructureCard
                activeTasks={[
                    {
                        id: 101,
                        templateName: "连锁生鲜超市晚高峰门店履约容量调研",
                        className: "2026级商业分析班",
                        deadline: "2026-12-16T10:00:00.000Z",
                        total: 6,
                        completed: 2,
                        pending: 1,
                        rejected: 1,
                    },
                    {
                        id: 102,
                        templateName: "连锁生鲜超市晚高峰门店履约容量调研",
                        className: "2026级商务统计1班",
                        deadline: null,
                        total: 10,
                        completed: 0,
                        pending: 0,
                        rejected: 0,
                    },
                ]}
                onSelectTask={() => undefined}
            />,
        );
        const svgText = view.getByTestId("teacher-dashboard-tasks-echart").querySelector("svg")?.textContent ?? "";
        expect(svgText).toContain("2026级商业分析班");
        expect(svgText).toContain("2026级商务统计1班");
    });

    test("GradeScoreHistogramCard staggers close mean/median MarkLines on separate horizontal tiers without overlap at 1024x768 width", () => {
        const view = render(
            <GradeScoreHistogramCard
                scores={{
                    count: 4,
                    average: 76.8,
                    median: 80.3,
                    componentAverages: { questionnaire: 78, process: 75, report: 77 },
                    bands: [
                        { label: "<60", count: 1 },
                        { label: "60–69", count: 0 },
                        { label: "70–79", count: 1 },
                        { label: "80–89", count: 1 },
                        { label: "90–100", count: 1 },
                    ],
                }}
            />,
        );

        const imgNode = view.getByTestId("teacher-grade-score-histogram").querySelector<HTMLElement>('[role="img"]');
        const instance = imgNode ? echarts.getInstanceByDom(imgNode) : null;
        const opt = instance?.getOption() as {
            grid?: Array<{ top?: number }>;
            series?: Array<{
                markLine?: {
                    data?: Array<{
                        name?: string;
                        label?: { position?: string; distance?: number; rotate?: number };
                    }>;
                };
            }>;
        } | undefined;

        const markLines = opt?.series?.[1]?.markLine?.data ?? [];
        expect(markLines).toHaveLength(2);
        const avgLine = markLines.find((item) => item.name === "总分均值");
        const medLine = markLines.find((item) => item.name === "总分中位数");
        expect(avgLine?.label?.position).toBe("end");
        expect(medLine?.label?.position).toBe("end");
        expect(avgLine?.label?.rotate ?? 0).toBe(0);
        expect(medLine?.label?.rotate ?? 0).toBe(0);
        expect(Math.abs((avgLine?.label?.distance ?? 0) - (medLine?.label?.distance ?? 0))).toBeGreaterThanOrEqual(14);
        expect(opt?.grid?.[0]?.top).toBeGreaterThanOrEqual(42);

        // Verify actual rendered SVG text transforms stay inside viewport (y >= 0) and are vertically separated
        const parseTextY = (node: Element | undefined): number => {
            const transform = node?.getAttribute("transform") ?? "";
            const match = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
            const ty = match ? Number(match[2]) : 0;
            const yAttr = Number(node?.getAttribute("y") ?? "0");
            return ty + yAttr;
        };
        const svgTexts = [...view.getByTestId("teacher-grade-score-histogram").querySelectorAll("svg text")];
        const avgText = svgTexts.find((node) => node.textContent?.includes("均值 76.8"));
        const medText = svgTexts.find((node) => node.textContent?.includes("中位 80.3"));
        expect(avgText !== undefined).toBe(true);
        expect(medText !== undefined).toBe(true);
        const avgY = parseTextY(avgText);
        const medY = parseTextY(medText);
        expect(avgY).toBeGreaterThan(0);
        expect(medY).toBeGreaterThan(0);
        expect(Math.abs(medY - avgY)).toBeGreaterThanOrEqual(14);
    });

    test("AdminPlatformOverviewCharts uses nice integer xAxis ticks for studentCount=34 and disables animation on roleBreakdown donut", async () => {
        const view = render(
            <AdminPlatformOverviewCharts
                stats={{
                    currentSemester: "2026-2027-1",
                    teacherCount: 3,
                    classCount: 4,
                    studentCount: 34,
                    pendingItems: 5,
                }}
            />,
        );

        const resourceImg = view.getByTestId("admin-dashboard-resource-chart").querySelector<HTMLElement>('[role="img"]');
        const resourceInstance = resourceImg ? echarts.getInstanceByDom(resourceImg) : null;
        const resourceOpt = resourceInstance?.getOption() as {
            xAxis?: Array<{ max?: number; interval?: number }>;
        } | undefined;
        const xMax = resourceOpt?.xAxis?.[0]?.max;
        const xInterval = resourceOpt?.xAxis?.[0]?.interval;
        expect(typeof xMax).toBe("number");
        expect(typeof xInterval).toBe("number");
        expect(xMax!).toBeGreaterThanOrEqual(Math.ceil(34 * 1.24));
        expect(xMax! % xInterval!).toBe(0);
        expect(xMax).toBe(50);
        expect(xInterval).toBe(10);

        // Verify roleBreakdownOption explicitly declares animation: false (not relying solely on HappyDOM defaults)
        const source = await Bun.file("src/components/charts/PortalAnalyticsCharts.tsx").text();
        const roleBlock = source.slice(source.indexOf("const roleBreakdownOption = useMemo"), source.indexOf("return (\n        <div className=\"grid", source.indexOf("const roleBreakdownOption = useMemo")));
        expect(roleBlock).toContain("animation: false");
    });
});
