import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CheckCircle2 } from "lucide-react";

import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    const view = render(
        <div>
            <StatusBadge intent="success">成功</StatusBadge>
            <StatusBadge intent="warning">警告</StatusBadge>
            <StatusBadge intent="destructive">危险</StatusBadge>
            <StatusBadge intent="info">信息</StatusBadge>
        </div>
    );

    expect(view.getByText("成功").className).toContain("bg-success-muted");
    expect(view.getByText("成功").className).toContain("[a&]:hover:border-success");
    expect(view.getByText("警告").className).toContain("text-warning");
    expect(view.getByText("危险").className).toContain("border-destructive-border");
    expect(view.getByText("信息").className).toContain("bg-info-muted");
});

test("icon tile keeps repeated stat icon styling tokenized", () => {
    const view = render(
        <div>
            <IconTile intent="primary" data-testid="primary-tile" />
            <IconTile intent="neutral" data-testid="neutral-tile" />
        </div>
    );

    expect(view.getByTestId("primary-tile").className).toContain("bg-primary-muted");
    expect(view.getByTestId("neutral-tile").className).toContain("h-10");
});

test("badge exposes its variant and gives linked secondary badges visible hover feedback", () => {
    const view = render(
        <Badge asChild variant="secondary">
            <a href="/details">查看详情</a>
        </Badge>,
    );
    const badge = view.getByRole("link", { name: "查看详情" });
    expect(badge.getAttribute("data-variant")).toBe("secondary");
    expect(badge.className).toContain("[a&]:hover:bg-accent");
});

test("card exposes one border-led semantic surface", () => {
    const view = render(
        <Card data-testid="default-card" />,
    );

    expect(view.getByTestId("default-card").className).toContain("bg-card");
    expect(view.getByTestId("default-card").className).toContain("border-border");
    expect(view.getByTestId("default-card").className).not.toContain("shadow-");
});

test("shared pattern components render expected accessible content", () => {
    const view = render(
        <PageHeader>
            <div>
                <h2>作业批改</h2>
                <p>查看待批改列表</p>
                <IconTile intent="info" data-testid="icon-tile" />
            </div>
            <div>
                <StatusBadge intent="success"><CheckCircle2 /> 已完成</StatusBadge>
            </div>
        </PageHeader>
    );

    expect(view.getByText("作业批改")).toBeTruthy();
    expect(view.getByText("查看待批改列表")).toBeTruthy();
    expect(view.getByText("已完成")).toBeTruthy();
    expect(view.getByTestId("icon-tile").className).toContain("bg-info-muted");
});
