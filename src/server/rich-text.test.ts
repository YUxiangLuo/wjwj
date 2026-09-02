import { expect, test } from "bun:test";
import { canonicalizeRichTextHtmlForStorage } from "./rich-text";

test("server rich-text canonicalizer uses an allowlist and browser-compatible raw-text parsing", () => {
    expect(canonicalizeRichTextHtmlForStorage(
        '<h2 onclick="alert(1)">标题</h2><img src=x onerror=alert(1)><p>正文<strong>重点</strong></p>',
    )).toBe("<h2>标题</h2><p>正文<strong>重点</strong></p>");
    expect(canonicalizeRichTextHtmlForStorage(`<p>可见</p><script>${"不可见".repeat(20)}`))
        .toBe("<p>可见</p>");
});
