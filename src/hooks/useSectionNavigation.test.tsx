import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render, cleanup } from "@testing-library/react";
import { useState } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { useSectionNavigation } from "./useSectionNavigation";

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

function Workspace() {
    const [section, selectSection, navigationRef] = useSectionNavigation<"one" | "two">("one", "#sticky-header");
    const [edits, setEdits] = useState(0);
    return <>
        <div id="sticky-header">Task and error notices</div>
        <div ref={navigationRef} data-testid="navigation">
            {(["one", "two"] as const).map(value => <button key={value} role="tab" data-state={section === value ? "active" : "inactive"} onClick={() => selectSection(value)}>{value}</button>)}
        </div>
        <div data-testid="section">{section}</div>
        <button onClick={() => selectSection("two")}>Continue</button>
        <button onClick={() => setEdits(edits + 1)}>Edit {edits}</button>
    </>;
}

test("mounting does not steal focus or scroll", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    render(<Workspace />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
});

test("a section action reveals the updated section below the sticky header and focuses its tab", () => {
    const view = render(<Workspace />);
    const navigation = view.getByTestId("navigation");
    const observed: string[] = [];
    navigation.scrollIntoView = mock(() => { observed.push(view.getByTestId("section").textContent!); });
    document.getElementById("sticky-header")!.getBoundingClientRect = () => ({ bottom: 210 }) as DOMRect;
    fireEvent.click(view.getByRole("button", { name: "Continue" }));
    expect(observed).toEqual(["two"]);
    expect(navigation.style.scrollMarginTop).toBe("226px");
    expect(navigation.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(document.activeElement).toBe(view.getByRole("tab", { name: "two" }));
});

test("editing and reselecting the current section do not jump the viewport", () => {
    const view = render(<Workspace />);
    const scroll = mock(() => {});
    view.getByTestId("navigation").scrollIntoView = scroll;
    fireEvent.click(view.getByRole("tab", { name: "one" }));
    fireEvent.click(view.getByRole("button", { name: "Edit 0" }));
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("tab", { name: "two" }));
    fireEvent.click(view.getByRole("button", { name: "Edit 1" }));
    fireEvent.click(view.getByRole("button", { name: "Continue" }));
    expect(scroll).toHaveBeenCalledTimes(1);
});

test("an unpinned sticky header uses its eventual position instead of leaving an extra gap", () => {
    const view = render(<Workspace />);
    const navigation = view.getByTestId("navigation");
    navigation.scrollIntoView = mock(() => {});
    const header = document.getElementById("sticky-header")!;
    header.style.position = "sticky";
    header.style.top = "64px";
    header.getBoundingClientRect = () => ({ bottom: 145, height: 57 }) as DOMRect;
    fireEvent.click(view.getByRole("tab", { name: "two" }));
    expect(navigation.style.scrollMarginTop).toBe("137px");
});

test("each navigation measures the current header height, including newly wrapped notices", () => {
    const view = render(<Workspace />);
    const navigation = view.getByTestId("navigation");
    navigation.scrollIntoView = mock(() => {});
    const header = document.getElementById("sticky-header")!;
    header.getBoundingClientRect = () => ({ bottom: 120 }) as DOMRect;
    fireEvent.click(view.getByRole("tab", { name: "two" }));
    expect(navigation.style.scrollMarginTop).toBe("136px");
    header.getBoundingClientRect = () => ({ bottom: 240 }) as DOMRect;
    fireEvent.click(view.getByRole("tab", { name: "one" }));
    expect(navigation.style.scrollMarginTop).toBe("256px");
    expect(document.activeElement).toBe(view.getByRole("tab", { name: "one" }));
});
