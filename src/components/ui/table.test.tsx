import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

import { installDomGlobals } from "@/test-utils/dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals().restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

/** 屏幕阅读器需要显式 scope 才能可靠地把表头关联到单元格。 */
test("table headers declare a column scope by default", () => {
    const view = render(
        <Table aria-label="班级列表">
            <TableHeader>
                <TableRow>
                    <TableHead>班级名称</TableHead>
                    <TableHead>学期</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell>2026级统计学1班</TableCell>
                    <TableCell>2024-2025-1</TableCell>
                </TableRow>
            </TableBody>
        </Table>,
    );

    for (const head of view.getAllByRole("columnheader")) {
        expect(head.getAttribute("scope")).toBe("col");
    }
    // 表格本身应可命名，供屏幕阅读器在页面中定位
    expect(view.getByRole("table", { name: "班级列表" })).toBeTruthy();
});

test("a caller can still override the default scope", () => {
    const view = render(
        <Table>
            <TableBody>
                <TableRow>
                    <TableHead scope="row">合计</TableHead>
                    <TableCell>10</TableCell>
                </TableRow>
            </TableBody>
        </Table>,
    );

    expect(view.getByRole("rowheader").getAttribute("scope")).toBe("row");
});
