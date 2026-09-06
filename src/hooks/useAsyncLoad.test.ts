import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { requireApiData, useAsyncLoad } from "./useAsyncLoad";

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => restore());

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test("latest load owns both data and errors, including a late rejection", async () => {
    const hook = renderHook(() => useAsyncLoad("加载失败"));
    const old = deferred<string>();
    const fresh = deferred<string>();
    const accepted: string[] = [];
    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
        older = hook.result.current.run(() => old.promise, value => accepted.push(value));
        newer = hook.result.current.run(() => fresh.promise, value => accepted.push(value));
    });
    await act(async () => { fresh.resolve("最新记录"); await newer; });
    await act(async () => { old.reject(new Error("旧请求失败")); await older; });
    expect(accepted).toEqual(["最新记录"]);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(false);
    hook.unmount();
});

test("failed loads retain previous input and a retry can recover", async () => {
    const hook = renderHook(() => useAsyncLoad("加载失败"));
    const values: string[] = ["未保存的输入"];
    await act(async () => {
        await hook.result.current.run(async () => requireApiData<string>({ success: false, error: { message: "网络暂时不可用" } }, "加载失败"), value => values.push(value));
    });
    expect(values).toEqual(["未保存的输入"]);
    expect(hook.result.current.error).toBe("网络暂时不可用");
    await act(async () => { await hook.result.current.run(async () => "恢复记录", value => values.push(value)); });
    expect(hook.result.current.error).toBeNull();
    expect(values).toEqual(["未保存的输入", "恢复记录"]);
    hook.unmount();
});

test("unmount prevents pending requests from writing into departed pages", async () => {
    const hook = renderHook(() => useAsyncLoad("加载失败"));
    const pending = deferred<string>();
    const accepted: string[] = [];
    let result!: Promise<boolean>;
    act(() => { result = hook.result.current.run(() => pending.promise, value => accepted.push(value)); });
    hook.unmount();
    pending.resolve("旧页面");
    expect(await result).toBe(false);
    expect(accepted).toEqual([]);
});
