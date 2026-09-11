import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");
const { RequestError } = await import("./RequestError");
bootstrapDom.restore();

let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom?.restore();
});

test("a permission error offers a way out instead of only a doomed retry", async () => {
    dom = installDomGlobals("http://localhost/class/1/students");
    const onRetry = mock(() => undefined);
    const view = render(
        <MemoryRouter>
            <RequestError message="无权限访问该班级" onRetry={onRetry} backTo="/class" backLabel="返回班级列表" />
        </MemoryRouter>,
    );

    const back = view.getByRole("link", { name: "返回班级列表" });
    expect(back.getAttribute("href")).toBe("/class");
    expect(view.getByRole("button", { name: "重试加载" })).toBeTruthy();
});

test("without a back target the error keeps its previous single-action shape", async () => {
    dom = installDomGlobals("http://localhost/class/1/students");
    const view = render(
        <MemoryRouter>
            <RequestError message="加载失败" onRetry={() => undefined} />
        </MemoryRouter>,
    );

    expect(view.queryByRole("link")).toBeNull();
    expect(view.getByRole("button", { name: "重试加载" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
});
