import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CheckCircle2 } from "lucide-react";

import { IconTile, iconTileVariants } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, statusBadgeVariants } from "@/components/StatusBadge";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("status badge variants use semantic intent tokens", () => {
    expect(statusBadgeVariants({ intent: "success" })).toContain("bg-success/10");
    expect(statusBadgeVariants({ intent: "warning" })).toContain("text-warning");
    expect(statusBadgeVariants({ intent: "destructive" })).toContain("border-destructive/20");
    expect(statusBadgeVariants({ intent: "info" })).toContain("bg-info/10");
});

test("icon tile variants keep repeated stat icon styling tokenized", () => {
    expect(iconTileVariants({ intent: "primary", size: "md" })).toContain("bg-primary/10");
    expect(iconTileVariants({ intent: "neutral", size: "lg" })).toContain("h-12");
});

test("shared pattern components render expected accessible content", () => {
    const view = render(
        <PageHeader
            title="作业批改"
            description="查看待批改列表"
            actions={<StatusBadge intent="success"><CheckCircle2 /> 已完成</StatusBadge>}
        >
            <IconTile intent="info" data-testid="icon-tile" />
        </PageHeader>
    );

    expect(view.getByText("作业批改")).toBeTruthy();
    expect(view.getByText("查看待批改列表")).toBeTruthy();
    expect(view.getByText("已完成")).toBeTruthy();
    expect(view.getByTestId("icon-tile").className).toContain("bg-info/10");
});
