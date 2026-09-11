import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render } = await import("@testing-library/react");

mock.module("@/components/ui/select", () => ({
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));
mock.module("@/components/DatetimePicker24", () => ({
    DatetimePicker24: ({ value, onChange, "data-testid": testId }: { value: string; onChange: (v: string) => void; "data-testid"?: string }) => (
        <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));

const { TaskPublishDialog } = await import("./TaskPublishDialog");
bootstrapDom.restore();

type Props = Parameters<typeof TaskPublishDialog>[0];

function makeProps(overrides: Partial<Props> = {}): Props {
    return {
        open: true,
        onOpenChange: () => undefined,
        availableTopics: [{ id: 1, name: "咖啡馆调查", description: null, status: 1, dataRows: 80, createdAt: "2026-09-01T00:00:00.000Z" }],
        availableClasses: [
            { id: 1, name: "统计一班", semester: "2026 秋", studentCount: 9, createdAt: "2026-09-01T00:00:00.000Z" },
            { id: 2, name: "统计二班", semester: "2026 秋", studentCount: 6, createdAt: "2026-09-02T00:00:00.000Z" },
        ],
        disabledClassIds: new Set<number>(),
        selectedTopicId: "1",
        onSelectedTopicIdChange: () => undefined,
        selectedClassIds: [],
        onToggleClass: () => undefined,
        deadline: "",
        onDeadlineChange: () => undefined,
        onPublish: () => undefined,
        ...overrides,
    };
}

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("a class that already has this topic's task is locked and cannot be toggled", () => {
    const onToggleClass = mock(() => undefined);
    const view = render(<TaskPublishDialog {...makeProps({ disabledClassIds: new Set([2]), onToggleClass })} />);

    const locked = view.getByTestId("teacher-task-class-check-2") as HTMLInputElement;
    expect(locked.disabled).toBe(true);
    expect(locked.checked).toBe(false);
    fireEvent.click(locked);
    expect(onToggleClass).not.toHaveBeenCalled();
    expect(view.getByText("已发布")).toBeTruthy();
});

test("an available class reports the toggle", () => {
    const onToggleClass = mock(() => undefined);
    const view = render(<TaskPublishDialog {...makeProps({ selectedClassIds: [1], onToggleClass })} />);

    expect((view.getByTestId("teacher-task-class-check-1") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByTestId("teacher-task-class-check-1"));
    expect(onToggleClass).toHaveBeenCalledWith(1);
});

test("submit and cancel route through their callbacks", () => {
    const onPublish = mock(() => undefined);
    const onOpenChange = mock(() => undefined);
    const view = render(<TaskPublishDialog {...makeProps({ onPublish, onOpenChange })} />);

    fireEvent.click(view.getByTestId("teacher-task-publish-submit"));
    expect(onPublish).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("the dialog exposes a single explicit exit", () => {
    const view = render(<TaskPublishDialog {...makeProps()} />);

    // The corner X (sr-only "关闭") is intentionally suppressed.
    expect(view.queryByText("关闭")).toBeNull();
    expect(view.getByRole("button", { name: "取消" })).toBeTruthy();
});
