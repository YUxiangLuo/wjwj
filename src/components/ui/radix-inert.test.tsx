import { afterAll, beforeAll, expect, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";
import { useInertAriaHiddenBackground } from "./radix-inert";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals().restore;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function Harness({ showContent }: { showContent: boolean }) {
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    useInertAriaHiddenBackground(content);
    return (
        <>
            <div data-testid="background" data-aria-hidden="true" aria-hidden="true">
                <button type="button">背景操作</button>
            </div>
            {showContent ? <div ref={setContent}>选择列表</div> : null}
        </>
    );
}

test("Radix-hidden backgrounds become inert and are restored on content unmount", async () => {
    const view = render(<Harness showContent />);
    const background = view.getByTestId("background");
    await waitFor(() => expect(background.inert).toBe(true));

    view.rerender(<Harness showContent={false} />);
    await waitFor(() => expect(background.inert).toBe(false));
});
