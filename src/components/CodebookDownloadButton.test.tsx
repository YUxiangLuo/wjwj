import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrap = installDomGlobals();
const { render, cleanup, fireEvent, act } = await import("@testing-library/react");
const { CodebookDownloadButton } = await import("./CodebookDownloadButton");
bootstrap.restore(); let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });
test("codebook download is single-flight and keeps the explicit server error visible for retry", async () => {
    let reject!: (error: Error) => void;
    const download = mock(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const view = render(<CodebookDownloadButton path="/first" download={download} />);
    fireEvent.click(view.getByTestId("codebook-download")); fireEvent.click(view.getByTestId("codebook-download"));
    expect(download).toHaveBeenCalledTimes(1); expect((view.getByTestId("codebook-download") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new Error("请教师先确认变量字典")));
    expect(view.getByRole("alert").textContent).toContain("请教师先确认变量字典");
    expect((view.getByTestId("codebook-download") as HTMLButtonElement).disabled).toBe(false);
});
test("an old download failure cannot attach to another task's button", async () => {
    let reject!: (error: Error) => void;
    const download = mock(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const view = render(<CodebookDownloadButton path="/first" download={download} />);
    fireEvent.click(view.getByTestId("codebook-download"));
    view.rerender(<CodebookDownloadButton path="/second" download={download} />);
    await act(async () => reject(new Error("旧任务失败")));
    expect(view.queryByRole("alert")).toBeNull(); expect((view.getByTestId("codebook-download") as HTMLButtonElement).disabled).toBe(false);
});
