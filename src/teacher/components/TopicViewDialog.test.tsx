import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render } = await import("@testing-library/react");

const getTopicDetail = mock(async () => ({
    success: true,
    data: {
        topic: {
            name: "食堂午间等待时间",
            description: "测试描述",
            fieldMapping: {
                identifier: "记录编号",
                stratified: ["校区"],
                numeric: ["等待分钟", "历史同期客流量", "开放窗口数"],
                others: [],
                studyContract: {
                    version: 1,
                    researchQuestion: "食堂午间等待时间均值是多少？",
                    targetPopulation: "全部午间履约波次",
                    unitOfAnalysis: "一个15分钟履约波次",
                    target: { kind: "mean", field: "等待分钟" },
                    businessDecision: "优化午间高峰窗口排班配置",
                },
            },
            samplingPolicy: {
                version: 1,
                methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" },
                ppsSizeFields: ["历史同期客流量"],
            },
            fieldworkConfig: {
                version: 1,
                preset: "peak_congestion",
                baseUnitNonResponseRate: 0.22,
                baseSpeederRate: 0.07,
                baseStraightlinerRate: 0.04,
                baseItemSkipRate: 0.02,
                contactCostPerUnit: 5,
                incentiveCostPerComplete: 18,
            },
        },
        hasExcelFile: true,
        attachments: [],
        recommendQuestions: [],
        excelInfo: {
            columns: ["记录编号", "等待分钟", "历史同期客流量", "开放窗口数"],
            preview: [],
            ppsEligibleFields: ["历史同期客流量", "开放窗口数"],
        },
    },
}));

mock.module("../api-client", () => ({
    teacherApi: { getTopicDetail },
    teacherResourceUrl: (path: string) => path,
}));

const { TopicViewDialog } = await import("./TopicViewDialog");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher/topic").restore;
    getTopicDetail.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("read-only sampling policy shows only the configured PPS size fields", async () => {
    const view = render(
        <TopicViewDialog
            open
            onOpenChange={() => undefined}
            topic={{
                id: 5,
                name: "食堂午间等待时间",
                description: "测试描述",
                status: 1,
                dataRows: 96,
                createdAt: "2026-09-10T00:00:00.000Z",
            }}
        />,
    );

    await view.findByText("测试描述");
    const tablist = view.getByRole("tablist", { name: "实验模板详情页签" });
    const tabs = view.getAllByRole("tab");
    expect(tablist).toBeTruthy();
    expect(tabs).toHaveLength(8);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    for (const tab of tabs) {
        expect(tab.hasAttribute("aria-pressed")).toBe(false);
        expect(tab.className).toContain("focus-visible:ring-inset");
    }

    fireEvent.click(view.getByRole("tab", { name: "抽样策略" }));
    expect(view.getByRole("tab", { name: "抽样策略" }).getAttribute("aria-selected")).toBe("true");
    expect(view.getByRole("tab", { name: "基本信息" }).getAttribute("aria-selected")).toBe("false");

    expect(view.getByText("PPS 规模变量")).toBeTruthy();
    expect(view.getByText("历史同期客流量")).toBeTruthy();
    expect(view.queryByText("开放窗口数")).toBeNull();
    expect(view.getByTestId("teacher-topic-view-fieldwork-config").textContent).toContain("高峰拥堵漏接场景");
    expect(view.getByTestId("teacher-topic-view-fieldwork-config").textContent).toContain("22%");
    expect(view.getByTestId("teacher-topic-view-fieldwork-config").textContent).toContain("5 元 / 18 元");

    fireEvent.click(view.getByRole("tab", { name: "字段映射" }));
    expect(view.getByTestId("teacher-topic-view-study-contract").textContent).toContain("优化午间高峰窗口排班配置");
});

test("read-only fieldwork config renders differential stratum rates and item skip rate", async () => {
    getTopicDetail.mockResolvedValueOnce({
        success: true,
        data: {
            topic: {
                name: "茶饮会员支付意愿",
                description: "测试分层拒访展示",
                fieldMapping: {
                    identifier: "会员编号",
                    stratified: ["会员等级"],
                    numeric: ["支付意愿"],
                    others: [],
                    studyContract: {
                        version: 1,
                        researchQuestion: "活跃会员最高支付意愿均值是多少元？",
                        targetPopulation: "240名活跃会员",
                        unitOfAnalysis: "一名活跃会员",
                        target: { kind: "mean", field: "支付意愿" },
                    },
                },
                samplingPolicy: {
                    version: 1,
                    methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "required" },
                },
                fieldworkConfig: {
                    version: 1,
                    preset: "stratum_differential",
                    baseUnitNonResponseRate: 0.18,
                    stratumField: "会员等级",
                    stratumNonResponseRates: { 普通会员: 0.3, 银卡会员: 0.16, 黑金会员: 0.06 },
                    baseSpeederRate: 0.07,
                    baseStraightlinerRate: 0.05,
                    baseItemSkipRate: 0.03,
                    contactCostPerUnit: 2,
                    incentiveCostPerComplete: 12,
                },
            },
            hasExcelFile: true,
            attachments: [],
            recommendQuestions: [],
            excelInfo: {
                columns: ["会员编号", "会员等级", "支付意愿"],
                preview: [],
                ppsEligibleFields: [],
            },
        },
    } as never);

    const view = render(
        <TopicViewDialog
            open
            onOpenChange={() => undefined}
            topic={{
                id: 9,
                name: "茶饮会员支付意愿",
                description: "测试分层拒访展示",
                status: 1,
                dataRows: 240,
                createdAt: "2026-09-10T00:00:00.000Z",
            }}
        />,
    );

    await view.findByText("测试分层拒访展示");
    fireEvent.click(view.getByRole("tab", { name: "抽样策略" }));

    const fwPanel = view.getByTestId("teacher-topic-view-fieldwork-config");
    expect(fwPanel.textContent).toContain("细分客群差异化拒访");
    expect(fwPanel.textContent).toContain("3%");
    expect(fwPanel.textContent).toContain("差异化应答分层字段：会员等级");
    expect(fwPanel.textContent).toContain("普通会员：无回答 30%");
    expect(fwPanel.textContent).toContain("黑金会员：无回答 6%");
});

test("read-only weights tab formats 10.03 + 57.98 + 31.99 as 100% without float artifact", async () => {
    getTopicDetail.mockResolvedValueOnce({
        success: true,
        data: {
            topic: {
                name: "小数权重模板",
                description: "测试小数权重",
                weightConfig: { questionnaire: 10.03, process: 57.98, report: 31.99 },
            },
            hasExcelFile: false,
            attachments: [],
            recommendQuestions: [],
            excelInfo: null,
        },
    } as never);

    const view = render(
        <TopicViewDialog
            open
            onOpenChange={() => undefined}
            topic={{
                id: 11,
                name: "小数权重模板",
                description: "测试小数权重",
                status: 1,
                dataRows: 0,
                createdAt: "2026-09-10T00:00:00.000Z",
            }}
        />,
    );

    await view.findByText("测试小数权重");
    fireEvent.click(view.getByRole("tab", { name: "评分规则" }));
    expect(view.container.textContent).not.toContain("99.99999999999999");
    expect(view.getByText("100%").className).toContain("text-success");
    expect(await getAccessibilityViolations(view.getByRole("dialog"))).toEqual([]);
});
