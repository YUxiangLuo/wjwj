import { expect, test } from "bun:test";
import { buildRichTextPdfBlocks, renderRichTextToPdf } from "./rich-text-pdf";

test("buildRichTextPdfBlocks preserves supported block and inline rich text semantics", () => {
    const blocks = buildRichTextPdfBlocks(
        "<h2>报告<strong>标题</strong></h2>"
        + "<p>第一段<em>斜体</em><br><u>下划线</u><s>删除线</s></p>"
        + "<blockquote><p>引用内容</p></blockquote>"
        + "<ol><li>其一</li><li><strong>其二</strong></li></ol>"
        + "<hr>"
    );

    expect(blocks).toEqual([
        {
            type: "heading",
            level: 2,
            lines: [[
                { text: "报告" },
                { text: "标题", bold: true },
            ]],
        },
        {
            type: "paragraph",
            lines: [
                [
                    { text: "第一段" },
                    { text: "斜体", italic: true },
                ],
                [
                    { text: "下划线", underline: true },
                    { text: "删除线", strike: true },
                ],
            ],
        },
        {
            type: "blockquote",
            lines: [[{ text: "引用内容" }]],
        },
        {
            type: "list",
            ordered: true,
            items: [
                {
                    blocks: [{
                        type: "paragraph",
                        lines: [[{ text: "其一" }]],
                    }],
                },
                {
                    blocks: [{
                        type: "paragraph",
                        lines: [[{ text: "其二", bold: true }]],
                    }],
                },
            ],
        },
        {
            type: "rule",
        },
    ]);
});

test("buildRichTextPdfBlocks preserves nested list order inside list items", () => {
    const blocks = buildRichTextPdfBlocks("<ul><li>外层<ul><li>内层一</li><li>内层二</li></ul>结尾</li></ul>");

    expect(blocks).toEqual([
        {
            type: "list",
            ordered: false,
            items: [{
                blocks: [
                    {
                        type: "paragraph",
                        lines: [[{ text: "外层" }]],
                    },
                    {
                        type: "list",
                        ordered: false,
                        items: [
                            {
                                blocks: [{
                                    type: "paragraph",
                                    lines: [[{ text: "内层一" }]],
                                }],
                            },
                            {
                                blocks: [{
                                    type: "paragraph",
                                    lines: [[{ text: "内层二" }]],
                                }],
                            },
                        ],
                    },
                    {
                        type: "paragraph",
                        lines: [[{ text: "结尾" }]],
                    },
                ],
            }],
        },
    ]);
});

test("renderRichTextToPdf maps inline styles to PDF text options", () => {
    const textCalls: Array<{
        text: string;
        options: Record<string, unknown>;
        fontSize: number;
        fillColor: string;
        lineWidth: number;
        fontAlias: string;
    }> = [];
    const drawCalls: Array<Record<string, unknown>> = [];

    const fakeDoc = {
        x: 50,
        y: 50,
        page: {
            width: 595,
            margins: { left: 50, right: 50 },
        },
        currentFontSize: 12,
        currentFillColor: "#000000",
        currentLineWidth: 0,
        currentFontAlias: "pdf-regular",
        font(name: string) {
            this.currentFontAlias = name;
            return this;
        },
        fontSize(size: number) {
            this.currentFontSize = size;
            return this;
        },
        fillColor(color: string) {
            this.currentFillColor = color;
            return this;
        },
        strokeColor(color: string) {
            drawCalls.push({ type: "strokeColor", color });
            return this;
        },
        lineWidth(width: number) {
            this.currentLineWidth = width;
            return this;
        },
        text(text: string, options: Record<string, unknown> = {}) {
            textCalls.push({
                text,
                options,
                fontSize: this.currentFontSize,
                fillColor: this.currentFillColor,
                lineWidth: this.currentLineWidth,
                fontAlias: this.currentFontAlias,
            });
            this.y += 12;
            this.x = this.page.margins.left;
            return this;
        },
        moveDown(lines = 1) {
            this.y += lines * 12;
            this.x = this.page.margins.left;
            return this;
        },
        moveTo(x: number, y: number) {
            drawCalls.push({ type: "moveTo", x, y });
            return this;
        },
        lineTo(x: number, y: number) {
            drawCalls.push({ type: "lineTo", x, y });
            return this;
        },
        stroke() {
            drawCalls.push({ type: "stroke" });
            return this;
        },
    };

    renderRichTextToPdf(
        fakeDoc as any,
        "<h2>标题</h2><p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除线</s></p><blockquote><p>引用</p></blockquote><ul><li>列表</li></ul><hr>",
        {
            fontAliases: {
                regular: "pdf-regular",
                bold: "pdf-bold",
            },
            useBoldFont: true,
        }
    );

    expect(textCalls.find((call) => call.text === "标题")?.fontSize).toBe(17);
    expect(textCalls.find((call) => call.text === "标题")?.fontAlias).toBe("pdf-bold");
    expect(textCalls.find((call) => call.text === "粗体")?.fontAlias).toBe("pdf-bold");
    expect(textCalls.find((call) => call.text === "粗体")?.options.stroke).toBe(false);
    expect(textCalls.find((call) => call.text === "斜体")?.options.oblique).toBe(10);
    expect(textCalls.find((call) => call.text === "下划线")?.options.underline).toBe(true);
    expect(textCalls.find((call) => call.text === "删除线")?.options.strike).toBe(true);
    expect(textCalls.find((call) => call.text === "引用")?.fillColor).toBe("#475569");
    expect(textCalls.find((call) => call.text === "• ")?.text).toBe("• ");
    expect(drawCalls.some((call) => call.type === "stroke")).toBe(true);
});

test("renderRichTextToPdf keeps nested list content in order", () => {
    const textCalls: string[] = [];

    const fakeDoc = {
        x: 50,
        y: 50,
        page: {
            width: 595,
            margins: { left: 50, right: 50 },
        },
        font() {
            return this;
        },
        fontSize() {
            return this;
        },
        fillColor() {
            return this;
        },
        strokeColor() {
            return this;
        },
        lineWidth() {
            return this;
        },
        text(text: string) {
            textCalls.push(text);
            this.y += 12;
            this.x = this.page.margins.left;
            return this;
        },
        moveDown(lines = 1) {
            this.y += lines * 12;
            this.x = this.page.margins.left;
            return this;
        },
        moveTo() {
            return this;
        },
        lineTo() {
            return this;
        },
        stroke() {
            return this;
        },
    };

    renderRichTextToPdf(
        fakeDoc as any,
        "<ul><li>外层<ul><li>内层</li></ul>结尾</li></ul>",
        {
            fontAliases: {
                regular: "pdf-regular",
                bold: "pdf-bold",
            },
            useBoldFont: true,
        }
    );

    expect(textCalls).toEqual(["• ", "外层", "• ", "内层", "结尾"]);
});
