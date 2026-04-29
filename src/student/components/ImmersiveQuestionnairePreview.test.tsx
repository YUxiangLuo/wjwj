import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

mock.module("@/components/ui/tooltip", () => ({
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipContent: () => null,
    TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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

    test("boolean question: selecting advances to ending", () => {
        const onComplete = mock(() => {});
        const view = render(
            <ImmersiveQuestionnairePreview
                questionnaire={baseQuestionnaire()}
                onComplete={onComplete}
                onClose={() => {}}
            />,
        );
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.click(view.getByText("是"));
        expect(view.getByTestId("immersive-preview-submit")).toBeTruthy();
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).toHaveBeenCalled();
    });

    test("dialog container keeps focus so space does not accidentally trigger exit or select options", async () => {
        const onClose = mock(() => {});
        const view = render(
            <ImmersiveQuestionnairePreview
                questionnaire={baseQuestionnaire()}
                onComplete={() => {}}
                onClose={onClose}
            />,
        );

        await waitFor(() => {
            expect(document.activeElement).toBe(view.getByTestId("immersive-questionnaire-preview"));
        });

        fireEvent.click(view.getByTestId("immersive-preview-start"));

        await waitFor(() => {
            expect(document.activeElement).toBe(view.getByTestId("immersive-questionnaire-preview"));
        });

        fireEvent.keyDown(view.getByTestId("immersive-questionnaire-preview"), {
            key: " ",
            code: "Space",
        });

        expect(onClose).not.toHaveBeenCalled();
        expect(view.queryByTestId("mock-alert-dialog")).toBeNull();
        expect(view.queryByTestId("immersive-preview-submit")).toBeNull();
        expect(view.getByText("是否测试？")).toBeTruthy();
    });
});
