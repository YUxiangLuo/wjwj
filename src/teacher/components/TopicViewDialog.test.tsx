import { afterEach, beforeEach, expect, mock, test } from "bun:test";
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
            },
            samplingPolicy: {
                version: 1,
                methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" },
                ppsSizeFields: ["历史同期客流量"],
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
    fireEvent.click(view.getByRole("button", { name: "抽样策略" }));

    expect(view.getByText("PPS 规模变量")).toBeTruthy();
    expect(view.getByText("历史同期客流量")).toBeTruthy();
    expect(view.queryByText("开放窗口数")).toBeNull();
});
