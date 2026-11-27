import { expect, mock, test } from "bun:test";
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

test("root and template routes enforce GET/HEAD and include Allow + security headers on 405", async () => {
    mock.module("../db", () => ({ db: {}, closeDatabase: async () => undefined }));
    const { rootRoute, templateRoute } = await import(`../index.ts?static-routes=${crypto.randomUUID()}`);

    for (const method of ["GET", "HEAD"] as const) {
        const res = rootRoute(new Request("https://example.com/", { method }));
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/student");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }

    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
        const rootRes = rootRoute(new Request("https://example.com/", { method }));
        expect(rootRes.status).toBe(405);
        expect(rootRes.headers.get("allow")).toBe("GET, HEAD");
        expect(rootRes.headers.get("x-content-type-options")).toBe("nosniff");

        const tplReq = Object.assign(
            new Request("https://example.com/templates/%E6%95%B0%E6%8D%AE%E6%A8%A1%E6%9D%BF.csv", { method }),
            { params: { name: "数据模板.csv" } },
        );
        const tplRes = await templateRoute(tplReq);
        expect(tplRes.status).toBe(405);
        expect(tplRes.headers.get("allow")).toBe("GET, HEAD");
        expect(tplRes.headers.get("x-content-type-options")).toBe("nosniff");
    }

    const headReq = Object.assign(
        new Request("https://example.com/templates/%E6%95%B0%E6%8D%AE%E6%A8%A1%E6%9D%BF.csv", { method: "HEAD" }),
        { params: { name: "数据模板.csv" } },
    );
    const headRes = await templateRoute(headReq);
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await headRes.text()).toBe("");
});
