import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { student } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";

async function load(created: string[] = []) {
    const { db, operations } = createMockDb({ select: [[{ id: 3 }], [], [{ id: 3 }]], insert: [created.map(studentId => ({ studentId }))] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const routes = await import(`./classroom.ts?validation=${crypto.randomUUID()}`);
    return { routes, operations };
}
function upload(file: File) {
    const body = new FormData();
    body.append("file", file);
    return Object.assign(new Request("https://example.com", { method: "POST", body }), { params: { classId: "3" } });
}

test("import validates canonical lengths and NUL per row before hashing or inserting", async () => {
    const { routes, operations } = await load(["VALID"]);
    const response = await routes.classStudentsImportRoutes.POST!(upload(new File([
        `studentId,name,email\n${"ﬃ".repeat(18)},展开超长,\nBAD\0ID,无效学号,\nBAD-NAME,无效\0姓名,\nBAD-MAIL,无效邮箱,a\0@example.com\nＶＡＬＩＤ,有效学生,\n`,
    ], "roster.csv")));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ successCount: 1, failureCount: 4 });
    expect(data.errors.map((e: { row: number }) => e.row)).toEqual([2, 3, 4, 5]);
    expect(data.errors[0].reason).toContain("50");
    const inserted = operations.find(op => op.kind === "insert" && op.table === student)?.values as any[];
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ studentId: "VALID", name: "有效学生" });
    expect(await Bun.password.verify("VALID", inserted[0].password)).toBe(true);
});

for (const extension of ["csv", "xlsx"] as const) {
    test(`import rejects ambiguous duplicate ${extension} headers before writing`, async () => {
        const { routes, operations } = await load();
        const rows = [["studentId", "name", "name"], ["A", "姓名甲", "姓名乙"]];
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "名单");
        const content = extension === "csv" ? rows.map(row => row.join(",")).join("\n") : XLSX.write(book, { type: "array", bookType: "xlsx" });
        const response = await routes.classStudentsImportRoutes.POST!(upload(new File([content], `roster.${extension}`)));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "INVALID_FILE" } });
        expect(operations.some(op => op.kind === "insert")).toBe(false);
    });
}

for (const field of ["studentId", "name", "email"] as const) {
    test(`single creation rejects NUL in ${field} without writing`, async () => {
        const { routes, operations } = await load();
        const response = await routes.classStudentsRoutes.POST!(Object.assign(new Request("https://example.com", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: "VALID", name: "学生", email: "", [field]: "bad\0value" }),
        }), { params: { classId: "3" } }));
        expect(response.status).toBe(400);
        expect(operations.some(op => op.kind === "insert")).toBe(false);
    });
}

test("imports insert in canonical ID order without detaching passwords or source row numbers", async () => {
    const { routes, operations } = await load(["a", "Z"]);
    const response = await routes.classStudentsImportRoutes.POST!(upload(new File(["studentId,name\nＺ,末位\na,首位\n"], "roster.csv")));
    expect(response.status).toBe(200);
    const inserted = operations.find(op => op.kind === "insert" && op.table === student)?.values as any[];
    expect(inserted.map(row => [row.studentId, row.name])).toEqual([["a", "首位"], ["Z", "末位"]]);
    for (const row of inserted) expect(await Bun.password.verify(row.studentId, row.password)).toBe(true);
});
