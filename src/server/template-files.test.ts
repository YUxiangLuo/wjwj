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

test("getTemplateContentType infers known template mime types", () => {
    expect(getTemplateContentType("数据模板.csv")).toBe("text/csv; charset=utf-8");
    expect(getTemplateContentType("数据上传规范.pdf")).toBe("application/pdf");
    expect(getTemplateContentType("file.bin")).toBe("application/octet-stream");
});

test("getTemplateContentDisposition uses attachment for csv and inline for others", () => {
    expect(getTemplateContentDisposition("数据模板.csv").startsWith("attachment;")).toBeTrue();
    expect(getTemplateContentDisposition("数据上传规范.pdf").startsWith("inline;")).toBeTrue();
});
