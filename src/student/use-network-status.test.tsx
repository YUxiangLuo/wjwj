import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDomGlobals } from "@/test-utils/dom";
import { useNetworkStatus } from "./use-network-status";

let restoreDom: (() => void) | null = null;

function NetworkStatusProbe() {
    const { isOnline, networkNotice } = useNetworkStatus({
        offlineMessage: "网络已断开，数据将保存在本地",
    });

    return (
        <div>
            <span data-testid="is-online">{String(isOnline)}</span>
            <span data-testid="network-notice">{networkNotice ?? ""}</span>
        </div>
    );
}

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

test("useNetworkStatus initializes the offline notice immediately when starting offline", () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
        configurable: true,
        value: false,
    });

    const html = renderToStaticMarkup(<NetworkStatusProbe />);

    expect(html).toContain("false");
    expect(html).toContain("网络已断开，数据将保存在本地");
});

test("useNetworkStatus exposes the offline notice in the browser render when starting offline", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
        configurable: true,
        value: false,
    });

    const view = render(<NetworkStatusProbe />);

    expect(view.getByTestId("is-online").textContent).toBe("false");
    expect(view.getByTestId("network-notice").textContent).toBe("网络已断开，数据将保存在本地");
});
