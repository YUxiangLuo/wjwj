import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const topic = { id: 12, name: "分类研究", status: 1, hasTasks: true, description: null, dataRows: 40, createdAt: "2026-09-01" };
let fieldMapping: unknown;
mock.module("../api-client", () => ({
    teacherResourceUrl: (path: string) => path,
    teacherApi: { getTopicDetail: async () => ({ success: true, data: {
        topic: { ...topic, fieldMapping }, hasExcelFile: true, attachments: [], recommendQuestions: [],
    } }) },
}));
const { TopicViewDialog } = await import("./TopicViewDialog");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals("http://localhost/teacher/topic").restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

for (const mode of ["mixed", "categorical-only", "legacy-others-only", "empty-others"] as const) {
    test(`read-only topic details expose all categorical roles: ${mode}`, async () => {
        fieldMapping = mode === "legacy-others-only" ? JSON.stringify({ others: ["是否达标"] }) : {
            identifier: "id", numeric: mode === "mixed" ? ["y"] : [], stratified: mode === "mixed" ? ["region_id"] : [],
            others: mode === "empty-others" ? [] : ["是否达标", "分类 "],
        };
        const view = render(<TopicViewDialog open onOpenChange={() => undefined} topic={topic} />);
        await waitFor(() => expect(view.getByRole("button", { name: "字段映射" })).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: "字段映射" }));
        const fields = await view.findByTestId("teacher-topic-other-fields");
        if (mode === "empty-others") expect(within(fields).getByText("未设置")).toBeTruthy();
        else expect(within(fields).getByText("是否达标")).toBeTruthy();
        expect(fields.textContent).toContain("不用于分层");
        expect(view.queryByText("暂未配置字段映射")).toBeNull();
        expect(within(fields).queryAllByRole("checkbox")).toHaveLength(0);
    });
}
