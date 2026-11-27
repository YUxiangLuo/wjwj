import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import type { VariableDictionary } from "@/domain/variables/types";

const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { UnivariateWorkspace } = await import("./UnivariateWorkspace");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

const dictionary: VariableDictionary = {
    source: "dict-hash",
    revision: 1,
    variables: [
        { field: "spend", label: "增购预算", unit: "万元", kind: "continuous", categories: [], missing: [] },
        { field: "unbound_metric", label: "未绑定满意度", unit: "", kind: "continuous", categories: [], missing: [] },
        { field: "industry", label: "所属行业", unit: "", kind: "nominal", categories: [{ value: "制造", label: "制造" }], missing: [] },
    ],
};

const wave2: ExperimentWaveView = {
    waveNumber: 2,
    kind: "main",
    label: "第 2 轮 · 正式投放",
    questionnaire: {
        title: "正式问卷",
        welcomeText: "欢迎参与",
        endingText: "感谢参与",
        questions: [
            {
                id: "q1",
                type: "numeric",
                content: "增购预算",
                variableBinding: {
                    taskId: 3,
                    source: "dict-hash",
                    revision: 1,
                    signature: "sig",
                    mappings: [{ field: "spend", answers: [] }],
                },
            },
        ],
    },
    samplePlan: null,
    samplingResults: {
        stratified: { completed: true, stratifyBy: "industry", layers: [], sampleCount: 20 },
    },
    fieldwork: null,
    cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
    diagnostics: {},
    completedAt: null,
};

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/3/experiment").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

describe("UnivariateWorkspace unbound variable notice & actionable weighted recovery", () => {
    test("warns when selecting an unbound variable under cleaned_respondents and offers 1-click unweighted fix on EMPTY_STRATUM_RESPONDENTS", async () => {
        globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary } });
            if (url.endsWith("/analyses") && (!init?.method || init.method === "GET")) {
                return Response.json({ success: true, data: { records: [], capacity: 20 } });
            }
            if (url.endsWith("/analyses") && init?.method === "POST") {
                return Response.json({
                    success: false,
                    error: {
                        code: "EMPTY_STRATUM_RESPONDENTS",
                        message: "质检后存在有效回收数为 0 的分层，无法直接计算分层加权估计，请改用未加权描述或在二轮补足该层样本",
                    },
                }, { status: 409 });
            }
            return Response.json({ success: true, data: {} });
        }) as unknown as typeof fetch;

        const view = render(
            <UnivariateWorkspace
                taskId={3}
                observedVersion={5}
                completedMethods={["stratified"]}
                waves={[wave2]}
                activeWaveNumber={2}
                references={[]}
                refreshRequired={false}
                onReferencesChange={() => undefined}
                onRefreshRequired={() => undefined}
            />,
        );

        await waitFor(() => expect(view.queryByTestId("student-univariate-disabled-hint") !== null).toBe(true));
        expect(view.getByTestId("student-univariate-disabled-hint").textContent).toContain("至少 5 字");
        expect(view.getByTestId("student-univariate-run").getAttribute("data-variant")).toBe("secondary");
        expect(view.container.querySelectorAll('[data-slot="button"][data-variant="default"]').length).toBe(0);
        expect(view.container.querySelectorAll('[data-slot="button"].w-full').length).toBe(0);

        fireEvent.change(view.container.querySelector("#analysis-question-input")!, {
            target: { value: "检验分层加权空层报错恢复交互" },
        });
        fireEvent.keyDown(view.getByRole("combobox", { name: "选择目标分析变量" }), { key: "ArrowDown" });
        const unboundOpt = await waitFor(() => view.getByRole("option", { name: "未绑定满意度" }));
        fireEvent.keyDown(unboundOpt, { key: "Enter" });

        // Unbound notice appears with quick switch to full_invited
        await waitFor(() => expect(view.queryByTestId("student-univariate-unbound-notice") !== null).toBe(true));

        // Enable weighted switch and run -> triggers EMPTY_STRATUM_RESPONDENTS with 1-click unweighted button
        const weightedSwitch = view.getByRole("switch");
        fireEvent.click(weightedSwitch);
        expect(weightedSwitch.getAttribute("aria-checked")).toBe("true");

        fireEvent.click(view.getByTestId("student-univariate-run"));
        const fixUnweightedBtn = await waitFor(() => view.getByTestId("student-univariate-fix-unweighted"));
        fireEvent.click(fixUnweightedBtn);

        expect(weightedSwitch.getAttribute("aria-checked")).toBe("false");
        expect(view.queryByRole("alert") === null).toBe(true);
    });
});
