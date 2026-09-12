import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import type { QuestionnaireData } from "../api-client";

mock.module("@/components/ui/alert-dialog", () => ({
    AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
        open ? <div data-testid="mock-alert-dialog">{children}</div> : null,
    AlertDialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    AlertDialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    AlertDialogFooter: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    AlertDialogHeader: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    AlertDialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    AlertDialogCancel: ({
        children,
        className,
        onClick,
    }: {
        children: ReactNode;
        className?: string;
        onClick?: () => void;
    }) => (
        <button type="button" className={className} onClick={onClick}>
            {children}
        </button>
    ),
    AlertDialogAction: ({
        children,
        className,
        onClick,
    }: {
        children: ReactNode;
        className?: string;
        onClick?: () => void;
    }) => (
        <button type="button" className={className} onClick={onClick}>
            {children}
        </button>
    ),
}));

const { ImmersiveQuestionnairePreview } = await import("./ImmersiveQuestionnairePreview");

function baseQuestionnaire(overrides: Partial<QuestionnaireData> = {}): QuestionnaireData {
    return {
        title: "测试问卷",
        welcomeText: "<p>欢迎</p>",
        endingText: "<p>谢谢</p>",
        questions: [
            {
                id: "q1",
                type: "boolean",
                content: "是否测试？",
            },
        ],
        ...overrides,
    };
}

async function settleAutoAdvance() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)); });
}

const twoQuestions = () => baseQuestionnaire({ questions: [
    { id: "first", type: "boolean", content: "第一题？" },
    { id: "second", type: "boolean", content: "第二题？" },
] });

describe("ImmersiveQuestionnairePreview", () => {
    let restoreDom: (() => void) | null = null;

    beforeEach(() => {
        restoreDom = installDomGlobals("http://localhost/student").restore;
    });

    afterEach(() => {
        cleanup();
        restoreDom?.();
        restoreDom = null;
    });

    test("empty question list: continue reaches ending", () => {
        const onComplete = mock(() => {});
        const onClose = mock(() => {});
        const view = render(
            <ImmersiveQuestionnairePreview
                questionnaire={baseQuestionnaire({ questions: [] })}
                onComplete={onComplete}
                onClose={onClose}
            />,
        );

        expect(view.getByText(/当前没有题目/)).toBeTruthy();
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        expect(view.getByTestId("immersive-preview-submit")).toBeTruthy();
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).toHaveBeenCalled();
    });

    test("duplicate question ids show warning banner", () => {
        const dup: QuestionnaireData = {
            ...baseQuestionnaire(),
            questions: [
                { id: "same", type: "boolean", content: "A" },
                { id: "same", type: "boolean", content: "B" },
            ],
        };
        const view = render(<ImmersiveQuestionnairePreview questionnaire={dup} onComplete={() => {}} onClose={() => {}} />);
        expect(view.getByText(/题目 ID 重复/)).toBeTruthy();
    });

    test("a choice can be changed during feedback and continued immediately", () => {
        const onComplete = mock(() => {});
        const view = render(
            <ImmersiveQuestionnairePreview
                questionnaire={baseQuestionnaire()}
                onComplete={onComplete}
                onClose={() => {}}
            />,
        );
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        expect((view.getByTestId("immersive-preview-next") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(view.getByText("是"));
        expect(view.getByText("是").closest("button")?.getAttribute("aria-pressed")).toBe("true");
        expect(view.getByText("是否测试？")).toBeTruthy();
        expect(view.queryByTestId("immersive-preview-submit")).toBeNull();
        fireEvent.click(view.getByText("否"));
        expect(view.getByText("是").closest("button")?.getAttribute("aria-pressed")).toBe("false");
        expect(view.getByText("否").closest("button")?.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        expect(view.getByTestId("immersive-preview-submit")).toBeTruthy();
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).toHaveBeenCalled();
    });

    for (const question of [
        { id: "choice", type: "boolean", content: "选择题？" },
        { id: "choice", type: "single", content: "选择题？", options: ["是", "否"] },
        { id: "choice", type: "scale", content: "选择题？", scaleMin: 1, scaleMax: 5 },
    ] satisfies QuestionnaireData["questions"]) {
        test(`${question.type} advances after its first answer without completing the preview`, async () => {
            const onComplete = mock(() => {});
            const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [question] })} onComplete={onComplete} onClose={() => {}} />);
            fireEvent.click(view.getByTestId("immersive-preview-start"));
            expect(view.getByText(/首次选择后自动继续/)).toBeTruthy();
            const content = within(view.getByTestId("questionnaire-preview-content"));
            fireEvent.click(content.getByText(question.type === "scale" ? "4" : "是"));
            expect(view.getByText(/已选择，即将继续/)).toBeTruthy();
            await settleAutoAdvance();
            expect(view.getByTestId("immersive-preview-submit")).toBeTruthy();
            expect(onComplete).not.toHaveBeenCalled();
            fireEvent.click(view.getByTestId("immersive-preview-submit"));
            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    }

    test("returned answers remain editable without automatically advancing again", async () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={twoQuestions()} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        await settleAutoAdvance();
        fireEvent.click(view.getByRole("button", { name: "上一题" }));
        expect(view.getByText("是").closest("button")?.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(view.getByText("否"));
        await settleAutoAdvance();
        expect(view.getByText("第一题？")).toBeTruthy();
        expect(view.getByText("否").closest("button")?.getAttribute("aria-pressed")).toBe("true");
        fireEvent.keyDown(view.getByText("否").closest("button")!, { key: "Enter" });
        expect(view.getByText("第二题？")).toBeTruthy();
    });

    test("multiple choice keeps its limits, stays on the question, and supports Enter beside the answers", async () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [
            { id: "multi", type: "multiple", content: "选两项", options: ["甲", "乙", "丙"], minSelect: 2, maxSelect: 2 },
            { id: "next", type: "boolean", content: "下一道题" },
        ] })} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        const next = view.getByTestId("immersive-preview-multiple-next") as HTMLButtonElement;
        expect(view.getByTestId("questionnaire-preview-content").contains(next)).toBe(true);
        expect(view.getByTestId("questionnaire-preview-progress").contains(next)).toBe(false);
        fireEvent.click(view.getByText("甲"));
        fireEvent.keyDown(view.getByTestId("immersive-questionnaire-preview"), { key: "Enter" });
        expect(next.disabled).toBe(true);
        fireEvent.click(view.getByText("乙"));
        expect(next.disabled).toBe(false);
        expect((view.getByText("丙").closest("button") as HTMLButtonElement).disabled).toBe(true);
        await settleAutoAdvance();
        expect(view.getByText("选两项")).toBeTruthy();
        fireEvent.click(view.getByText("甲"));
        expect(next.disabled).toBe(true);
        fireEvent.click(view.getByText("丙"));
        fireEvent.keyDown(view.getByText("丙").closest("button")!, { key: "Enter" });
        expect(view.getByText("下一道题")).toBeTruthy();
    });

    test("rapid manual continuation cancels a pending advance without skipping another question", async () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={twoQuestions()} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        const next = view.getByTestId("immersive-preview-next");
        act(() => { next.click(); next.click(); });
        await settleAutoAdvance();
        expect(view.getByText("第二题？")).toBeTruthy();
        expect(view.queryByTestId("immersive-preview-submit")).toBeNull();
    });

    for (const navigation of ["previous", "jump", "exit"] as const) {
        test(`${navigation} cancels pending automatic navigation`, async () => {
            const view = render(<ImmersiveQuestionnairePreview questionnaire={twoQuestions()} onComplete={() => {}} onClose={() => {}} />);
            fireEvent.click(view.getByTestId("immersive-preview-start"));
            fireEvent.click(view.getByText("是"));
            if (navigation === "previous") fireEvent.click(view.getByRole("button", { name: "上一题" }));
            if (navigation === "jump") fireEvent.click(view.getByTitle("第 1 题"));
            if (navigation === "exit") fireEvent.click(view.getByTestId("immersive-preview-close"));
            await settleAutoAdvance();
            expect(view.queryByText("第二题？")).toBeNull();
            if (navigation === "previous") expect(view.getByTestId("immersive-preview-start")).toBeTruthy();
            if (navigation === "exit") expect(view.getByTestId("mock-alert-dialog")).toBeTruthy();
        });
    }

    test("Enter does not steal activation from other controls or auto-repeat into another question", () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={twoQuestions()} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        const no = view.getByText("否").closest("button")!;
        expect(fireEvent.keyDown(no, { key: "Enter" })).toBe(true);
        expect(fireEvent.keyDown(view.getByTestId("immersive-preview-close"), { key: "Enter" })).toBe(true);
        const overlay = view.getByTestId("immersive-questionnaire-preview");
        fireEvent.keyDown(overlay, { key: "Enter", repeat: true });
        fireEvent.keyDown(overlay, { key: "Enter", isComposing: true });
        expect(view.getByText("第一题？")).toBeTruthy();
        fireEvent.keyDown(overlay, { key: "Enter" });
        expect(view.getByText("第二题？")).toBeTruthy();
    });

    test("unmount cancels a pending advance without completing the preview", async () => {
        const onComplete = mock(() => {});
        const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire()} onComplete={onComplete} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        view.unmount();
        await settleAutoAdvance();
        expect(onComplete).not.toHaveBeenCalled();
    });

    test("automatic navigation keeps duplicate IDs independent and resets the content scroll", async () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [
            { id: "same", type: "boolean", content: "第一题？" },
            { id: "same", type: "boolean", content: "第二题？" },
        ] })} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        const content = view.getByTestId("questionnaire-preview-content");
        content.scrollTop = 200;
        fireEvent.click(view.getByText("是"));
        await settleAutoAdvance();
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        expect(content.scrollTop).toBe(0);
        expect(view.getByText("第二题？")).toBeTruthy();
        expect((view.getByTestId("immersive-preview-next") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(view.getByText("否"));
        await settleAutoAdvance();
        expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(false);
    });

    test("replacing the questions cancels a pending advance", async () => {
        const onComplete = mock(() => {});
        const view = render(<ImmersiveQuestionnairePreview questionnaire={twoQuestions()} onComplete={onComplete} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        view.rerender(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [] })} onComplete={onComplete} onClose={() => {}} />);
        await settleAutoAdvance();
        expect(view.getByTestId("immersive-preview-start")).toBeTruthy();
        expect(onComplete).not.toHaveBeenCalled();
    });

    test("the ending page names each unanswered question and jumps to it", () => {
        const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [
            { id: "first", type: "boolean", content: "第一题？" },
            { id: "last", type: "boolean", content: "最后一题？" },
        ] })} onComplete={() => {}} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByTitle("第 2 题"));
        fireEvent.click(view.getByText("是"));
        fireEvent.click(view.getByTestId("immersive-preview-next"));

        const missing = view.getByTestId("immersive-preview-missing-1");
        expect(missing.textContent).toContain("第 1 题");
        expect(missing.textContent).toContain("第一题？");
        fireEvent.click(missing);
        expect(view.getByText("第一题？")).toBeTruthy();
    });

    test("jumping to the last question cannot complete an unanswered preview", () => {
        const onComplete = mock(() => {});
        const view = render(<ImmersiveQuestionnairePreview questionnaire={baseQuestionnaire({ questions: [
            { id: "first", type: "boolean", content: "第一题？" },
            { id: "last", type: "boolean", content: "最后一题？" },
        ] })} onComplete={onComplete} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByTitle("第 2 题"));
        fireEvent.click(view.getByText("是"));
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).not.toHaveBeenCalled();
        fireEvent.click(view.getByText("返回未答题"));
        expect(view.getByText("第一题？")).toBeTruthy();
        fireEvent.click(view.getByText("否"));
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        fireEvent.click(view.getByText("是"));
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});
