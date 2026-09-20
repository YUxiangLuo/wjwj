import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrap = installDomGlobals();
const { render, cleanup, fireEvent, waitFor, act } = await import("@testing-library/react");
mock.module("@/components/ui/select", () => ({
    Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (value: string) => void; disabled: boolean }) => <select aria-label="CSV 文件编码" value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
const { CsvFileReviewDialog } = await import("./CsvFileReviewDialog");
const { StudentImportDialog } = await import("@/teacher/components/StudentImportDialog");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });
const ambiguous = () => new File(["studentId,name\n000001,", Buffer.from("c2acc3af", "hex"), "\n"], "roster.csv");

test("ambiguous GBK requires review; changing encoding updates text before confirmation and persists BOM", async () => {
    const confirm = mock((_file: File) => {});
    const view = render(<CsvFileReviewDialog file={ambiguous()} onConfirm={confirm} onCancel={() => {}} />);
    await view.findByText("¬ï");
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(view.getByRole("combobox"), { target: { value: "gb18030" } });
    expect((view.getByTestId("csv-review-confirm") as HTMLButtonElement).disabled).toBe(true);
    await view.findByText("卢茂");
    fireEvent.click(view.getByTestId("csv-review-confirm"));
    fireEvent.click(view.getByTestId("csv-review-confirm"));
    expect(confirm).toHaveBeenCalledTimes(1);
    const file = confirm.mock.calls[0]![0];
    expect(file.name).toBe("roster.csv");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    expect(new TextDecoder().decode(bytes)).toBe("studentId,name\n000001,卢茂\n");
});

test("truncated UTF-8 is an error, not an automatic GB18030 preview", async () => {
    const confirm = mock(() => {});
    const view = render(<CsvFileReviewDialog file={new File(["id,name\n001,", Buffer.from("e5bc", "hex"), "\n"], "broken.csv")} onConfirm={confirm} onCancel={() => {}} />);
    await view.findByRole("alert");
    expect(view.queryByText("寮")).toBeNull();
    expect((view.getByTestId("csv-review-confirm") as HTMLButtonElement).disabled).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
});

test("BOM fixes the encoding; UTF-16 preview is confirmed as UTF-8", async () => {
    const confirm = mock((_file: File) => {});
    const view = render(<CsvFileReviewDialog file={new File([Buffer.from("\uFEFFid,name\n001,张三\n", "utf16le")], "roster.csv")} onConfirm={confirm} onCancel={() => {}} />);
    await view.findByText("张三");
    expect((view.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(view.getByTestId("csv-review-confirm"));
    expect(new TextDecoder().decode(await confirm.mock.calls[0]![0].arrayBuffer())).toBe("id,name\n001,张三\n");
});

for (const content of ['id,name\n001,"unterminated', 'id,name,name\n001,甲,乙', 'id,name\n']) {
    test(`invalid CSV cannot be confirmed: ${JSON.stringify(content)}`, async () => {
        const view = render(<CsvFileReviewDialog file={new File([content], "roster.csv")} onConfirm={() => {}} onCancel={() => {}} />);
        await view.findByRole("alert");
        expect((view.getByTestId("csv-review-confirm") as HTMLButtonElement).disabled).toBe(true);
    });
}

test("a late file read cannot overwrite a newer file preview", async () => {
    let finish!: (buffer: ArrayBuffer) => void;
    const old = new File(["old"], "old.csv");
    const read = mock(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; }));
    Object.defineProperty(old, "arrayBuffer", { value: read });
    const confirm = mock((_file: File) => {});
    const view = render(<CsvFileReviewDialog file={old} onConfirm={confirm} onCancel={() => {}} />);
    await waitFor(() => expect(read).toHaveBeenCalled());
    view.rerender(<CsvFileReviewDialog file={new File(["id,name\n001,新文件"], "new.csv")} onConfirm={confirm} onCancel={() => {}} />);
    await view.findByText("新文件");
    await act(async () => { finish(new TextEncoder().encode("id,name\n001,旧文件").buffer); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(view.queryByText("旧文件")).toBeNull();
    fireEvent.click(view.getByTestId("csv-review-confirm"));
    expect(confirm.mock.calls[0]![0].name).toBe("new.csv");
});

test("roster CSV selection and cancellation never make an unreviewed file importable", async () => {
    const change = mock((_file: File | null) => {});
    const importRows = mock(() => {});
    const view = render(<StudentImportDialog open onOpenChange={() => {}} importFile={null} onImportFileChange={change} importing={false} importResult={null} onDownloadTemplate={() => {}} onDownloadErrors={() => {}} onImport={importRows} />);
    fireEvent.change(view.getByTestId("teacher-student-import-file"), { target: { files: [ambiguous()] } });
    await view.findByText("¬ï");
    expect(change.mock.calls.every(([file]) => file === null)).toBe(true);
    expect(importRows).not.toHaveBeenCalled();
    fireEvent.click(view.getAllByRole("button", { name: "取消" }).at(-1)!);
    await waitFor(() => expect(view.queryByTestId("csv-file-review")).toBeNull());
    expect(change.mock.calls.every(([file]) => file === null)).toBe(true);
});

test("a confirmed roster shows one selected-file state and keeps a reselect action", () => {
    const file = new File(["studentId,name\n001,张三\n"], "roster.csv");
    const view = render(<StudentImportDialog open onOpenChange={() => {}} importFile={file} onImportFileChange={() => {}} importing={false} importResult={null} onDownloadTemplate={() => {}} onDownloadErrors={() => {}} onImport={() => {}} />);
    const input = view.getByTestId("teacher-student-import-file") as HTMLInputElement;
    const click = mock(() => {});
    input.click = click;

    expect(input.className).toContain("hidden");
    expect(view.getByText("已选择：roster.csv")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "重新选择文件" }));
    expect(click).toHaveBeenCalledTimes(1);
});
