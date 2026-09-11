import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

    test("a selected answer stays editable until the student chooses to continue", () => {
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
