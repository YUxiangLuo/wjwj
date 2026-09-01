import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { FieldMappingState } from "./StudyContractEditor";

let restoreDom: (() => void) | null = null;

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

const meanTarget = { kind: "mean" as const, field: "每周学习时长" };

// 说明：happy-dom 环境下 React 的 input/change 事件不会冒泡到根监听器（click 正常），
// 因此编辑交互由 StudyContractEditor.test.ts 的纯函数测试覆盖，这里只断言渲染行为。

test("legacy mappings render contract defaults without a stored contract", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { StudyContractEditor } = await import("./StudyContractEditor");

    const legacy: FieldMappingState = {
        identifier: "编号",
        stratified: ["年级"],
        numeric: ["每周学习时长"],
        others: [],
        analysisTarget: meanTarget,
    };
    const view = render(
        <StudyContractEditor
            value={legacy}
            onChange={() => undefined}
            topicName="学习情况调查"
            categoricalFields={["年级"]}
            analysisCategoryValues={[]}
            disabled={false}
        />,
    );

    expect((view.getByTestId("teacher-contract-question") as HTMLTextAreaElement).value)
        .toBe("学习情况调查中每周学习时长的平均水平是多少？");
    expect((view.getByTestId("teacher-contract-population") as HTMLInputElement).value).toBe("上传总体数据中的全部单位");
    expect((view.getByTestId("teacher-contract-unit") as HTMLInputElement).value).toBe("总体数据中的一行记录");
});

test("stored contracts render their own values and honor the disabled state", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { buildDefaultStudyContract, StudyContractEditor } = await import("./StudyContractEditor");

    const mapping: FieldMappingState = {
        identifier: "编号",
        stratified: ["年级"],
        numeric: ["每周学习时长"],
        others: [],
        analysisTarget: meanTarget,
        studyContract: {
            ...buildDefaultStudyContract("学习情况调查", meanTarget),
            researchQuestion: "学生投入学习时间是否充足？",
            targetPopulation: "某高校全体本科生",
        },
    };
    const view = render(
        <StudyContractEditor
            value={mapping}
            onChange={() => undefined}
            topicName="学习情况调查"
            categoricalFields={["年级"]}
            analysisCategoryValues={[]}
            disabled
        />,
    );

    expect((view.getByTestId("teacher-contract-question") as HTMLTextAreaElement).value)
        .toBe("学生投入学习时间是否充足？");
    expect((view.getByTestId("teacher-contract-population") as HTMLInputElement).value).toBe("某高校全体本科生");
    // 已发布课题（冻结）：所有合同输入只读
    expect((view.getByTestId("teacher-contract-question") as HTMLTextAreaElement).disabled).toBe(true);
    expect((view.getByTestId("teacher-contract-population") as HTMLInputElement).disabled).toBe(true);
    expect((view.getByTestId("teacher-contract-unit") as HTMLInputElement).disabled).toBe(true);
});
