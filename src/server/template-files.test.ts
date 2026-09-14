import { expect, test } from "bun:test";
import { basename } from "node:path";
import { getTemplateContentDisposition, getTemplateContentType, resolveTemplatePath } from "./template-files";

test("resolveTemplatePath resolves safe file names under templates directory", () => {
    const resolved = resolveTemplatePath("数据模板.csv");
    expect(resolved).not.toBeNull();
    expect(basename(resolved!)).toBe("数据模板.csv");
    expect(resolved!).toContain("/public/templates/");
});

test("resolveTemplatePath rejects empty or traversal names", () => {
    expect(resolveTemplatePath("")).toBeNull();
    expect(resolveTemplatePath("../secret.txt")).toBeNull();
    expect(resolveTemplatePath("%2e%2e%2fsecret.txt")).toBeNull();
    expect(resolveTemplatePath("a/b.csv")).toBeNull();
    expect(resolveTemplatePath("a\\b.csv")).toBeNull();
});

test("resolveTemplatePath rejects control characters instead of throwing", () => {
    // 回归：解码后的 NUL 曾让 /templates/:name 抛出并返回 500（应为 404）。
    expect(resolveTemplatePath("csv-template.csv%00.png")).toBeNull();
    expect(resolveTemplatePath("数据模板.csv\u0000")).toBeNull();
    expect(resolveTemplatePath("a\u001fb.csv")).toBeNull();
});

test("getTemplateContentType infers known template mime types", () => {
    expect(getTemplateContentType("数据模板.csv")).toBe("text/csv; charset=utf-8");
    expect(getTemplateContentType("数据上传规范.pdf")).toBe("application/pdf");
    expect(getTemplateContentType("调查问卷设计规范与模板.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(getTemplateContentType("file.bin")).toBe("application/octet-stream");
});

test("getTemplateContentDisposition downloads editable templates and previews PDFs inline", () => {
    expect(getTemplateContentDisposition("数据模板.csv").startsWith("attachment;")).toBeTrue();
    expect(getTemplateContentDisposition("调查问卷设计规范与模板.docx").startsWith("attachment;")).toBeTrue();
    expect(getTemplateContentDisposition("数据上传规范.pdf").startsWith("inline;")).toBeTrue();
});

test("questionnaire template artifacts are present and nonempty", async () => {
    for (const name of ["调查问卷设计规范与模板.docx", "调查问卷设计规范与模板.pdf"]) {
        const path = resolveTemplatePath(name);
        expect(path).not.toBeNull();
        const file = Bun.file(path!);
        expect(await file.exists()).toBeTrue();
        expect(file.size).toBeGreaterThan(1_000);
    }
});
