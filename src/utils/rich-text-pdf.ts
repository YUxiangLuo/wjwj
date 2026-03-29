import { getRichTextPlainText } from "./rich-text";

export interface PdfRichTextSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
}

export type PdfRichTextLine = PdfRichTextSegment[];

export interface PdfRichTextListItem {
    blocks: PdfRichTextBlock[];
}

export type PdfRichTextBlock =
    | { type: "paragraph"; lines: PdfRichTextLine[] }
    | { type: "heading"; level: number; lines: PdfRichTextLine[] }
    | { type: "blockquote"; lines: PdfRichTextLine[] }
    | { type: "list"; ordered: boolean; items: PdfRichTextListItem[] }
    | { type: "rule" };

interface PdfTextMarks {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
}

type ParsedHtmlNode =
    | { type: "text"; text: string }
    | { type: "element"; tagName: string; children: ParsedHtmlNode[] };

interface PdfPageLike {
    width: number;
    margins: { left: number; right: number };
}

export interface PdfDocLike {
    x: number;
    y: number;
    page: PdfPageLike;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string, opacity?: number): this;
    strokeColor(color: string, opacity?: number): this;
    lineWidth(width: number): this;
    text(text: string, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
}

interface RenderBlockStyle {
    fontSize: number;
    textColor: string;
    indent?: number;
    lineGap?: number;
    forceBold?: boolean;
}

interface RenderRichTextPdfOptions {
    baseFontSize?: number;
    fontAliases?: {
        regular: string;
        bold?: string;
    };
    useBoldFont?: boolean;
}

const BLOCK_TAGS = new Set(["p", "blockquote", "ul", "ol", "hr", "h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK_CONTAINER_TAGS = new Set(["div", "section", "article", "header", "footer"]);
const DEFAULT_TEXT_COLOR = "#111827";
const DEFAULT_HEADING_COLOR = "#0f172a";
const DEFAULT_QUOTE_COLOR = "#475569";
const DEFAULT_QUOTE_BORDER_COLOR = "#cbd5e1";
const DEFAULT_RULE_COLOR = "#cbd5e1";
const DROP_CONTENT_TAGS = new Set(["script", "style", "noscript"]);
const HTML_ENTITY_MAP: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&apos;": "'",
};

function isLineMeaningful(line: PdfRichTextLine) {
    return line.some((segment) => segment.text.trim().length > 0);
}

function cloneMarks(marks: PdfTextMarks, extra?: PdfTextMarks): PdfTextMarks {
    return { ...marks, ...extra };
}

function decodeHtmlEntities(input: string) {
    let output = input;
    Object.entries(HTML_ENTITY_MAP).forEach(([entity, value]) => {
        output = output.replaceAll(entity, value);
    });
    return output;
}

function parseSimpleHtml(input: string) {
    const root: ParsedHtmlNode = { type: "element", tagName: "root", children: [] };
    const stack: ParsedHtmlNode[] = [root];
    const tokenPattern = /<\/?[a-zA-Z0-9]+(?:\s[^<>]*)?>/g;
    let cursor = 0;
    let droppingTag: string | null = null;
    let dropDepth = 0;

    const appendText = (text: string) => {
        if (!text || droppingTag) return;
        const current = stack[stack.length - 1];
        if (!current || current.type !== "element") return;
        current.children.push({ type: "text", text: decodeHtmlEntities(text) });
    };

    for (const match of input.matchAll(tokenPattern)) {
        const fullTag = match[0];
        const startIndex = match.index ?? 0;
        appendText(input.slice(cursor, startIndex));
        cursor = startIndex + fullTag.length;

        const tagNameMatch = /^<\/?\s*([a-zA-Z0-9]+)/.exec(fullTag);
        const rawTagName = tagNameMatch?.[1];
        if (!rawTagName) continue;

        const tagName = rawTagName.toLowerCase();
        const isClosing = /^<\//.test(fullTag);
        const isSelfClosing = /\/>$/.test(fullTag) || tagName === "br" || tagName === "hr";

        if (droppingTag) {
            if (!isClosing && tagName === droppingTag) {
                dropDepth += 1;
            } else if (isClosing && tagName === droppingTag) {
                if (dropDepth === 0) {
                    droppingTag = null;
                } else {
                    dropDepth -= 1;
                }
            }
            continue;
        }

        if (!isClosing && DROP_CONTENT_TAGS.has(tagName)) {
            droppingTag = tagName;
            dropDepth = 0;
            continue;
        }

        if (isClosing) {
            while (stack.length > 1) {
                const current = stack.pop();
                if (current?.type === "element" && current.tagName === tagName) {
                    break;
                }
            }
            continue;
        }

        const element: ParsedHtmlNode = { type: "element", tagName, children: [] };
        const parent = stack[stack.length - 1];
        if (parent?.type === "element") {
            parent.children.push(element);
        }

        if (!isSelfClosing) {
            stack.push(element);
        }
    }

    appendText(input.slice(cursor));
    return root.children;
}

function pushLine(lines: PdfRichTextLine[]) {
    lines.push([]);
}

function pushSegment(lines: PdfRichTextLine[], text: string, marks: PdfTextMarks) {
    if (!text) return;

    const currentLine = lines[lines.length - 1];
    if (!currentLine) return;

    const normalizedText = text.replace(/\u00a0/g, " ");
    if (!normalizedText) return;

    const lastSegment = currentLine[currentLine.length - 1];
    if (
        lastSegment
        && lastSegment.bold === marks.bold
        && lastSegment.italic === marks.italic
        && lastSegment.underline === marks.underline
        && lastSegment.strike === marks.strike
    ) {
        lastSegment.text += normalizedText;
        return;
    }

    currentLine.push({
        text: normalizedText,
        bold: marks.bold,
        italic: marks.italic,
        underline: marks.underline,
        strike: marks.strike,
    });
}

function appendCollectedLines(target: PdfRichTextLine[], nested: PdfRichTextLine[], separateParagraph = false) {
    if (nested.length === 0) return;

    const hasCurrentContent = target.length > 0 && isLineMeaningful(target[target.length - 1] ?? []);
    if (separateParagraph && hasCurrentContent) {
        pushLine(target);
    }

    nested.forEach((line, index) => {
        if (index > 0) {
            pushLine(target);
        }
        line.forEach((segment) => pushSegment(target, segment.text, segment));
    });

    if (separateParagraph && isLineMeaningful(target[target.length - 1] ?? [])) {
        pushLine(target);
    }
}

function normalizeLines(lines: PdfRichTextLine[]) {
    const normalized: PdfRichTextLine[] = [];
    let pendingEmpty = false;

    for (const line of lines) {
        if (!isLineMeaningful(line)) {
            pendingEmpty = normalized.length > 0;
            continue;
        }

        if (pendingEmpty) {
            normalized.push([]);
            pendingEmpty = false;
        }
        normalized.push(line);
    }

    return normalized;
}

function collectInlineLines(nodes: ParsedHtmlNode[], marks: PdfTextMarks = {}): PdfRichTextLine[] {
    const lines: PdfRichTextLine[] = [[]];

    const visit = (node: ParsedHtmlNode, activeMarks: PdfTextMarks) => {
        if (node.type === "text") {
            const text = node.text.replace(/\r\n?/g, "\n");
            const parts = text.split("\n");
            parts.forEach((part, index) => {
                pushSegment(lines, part, activeMarks);
                if (index < parts.length - 1) {
                    pushLine(lines);
                }
            });
            return;
        }

        if (node.type !== "element") return;
        const { tagName } = node;

        switch (tagName) {
            case "br":
                pushLine(lines);
                return;
            case "strong":
            case "b":
                node.children.forEach((child) => visit(child, cloneMarks(activeMarks, { bold: true })));
                return;
            case "em":
            case "i":
                node.children.forEach((child) => visit(child, cloneMarks(activeMarks, { italic: true })));
                return;
            case "u":
                node.children.forEach((child) => visit(child, cloneMarks(activeMarks, { underline: true })));
                return;
            case "s":
                node.children.forEach((child) => visit(child, cloneMarks(activeMarks, { strike: true })));
                return;
            case "p":
            case "div":
            case "section":
            case "article":
            case "header":
            case "footer": {
                const nested = collectInlineLines(node.children, activeMarks);
                appendCollectedLines(lines, nested, true);
                return;
            }
            default:
                node.children.forEach((child) => visit(child, activeMarks));
        }
    };

    nodes.forEach((node) => visit(node, marks));
    return normalizeLines(lines);
}

function buildListItem(element: Extract<ParsedHtmlNode, { type: "element" }>): PdfRichTextListItem | null {
    const blocks: PdfRichTextBlock[] = [];
    let pendingInlineNodes: ParsedHtmlNode[] = [];

    const flushPendingInlineNodes = () => {
        if (pendingInlineNodes.length === 0) return;
        const nested = collectInlineLines(pendingInlineNodes);
        if (nested.length > 0) {
            blocks.push({ type: "paragraph", lines: nested });
        }
        pendingInlineNodes = [];
    };

    element.children.forEach((child) => {
        if (child.type === "element") {
            const { tagName } = child;
            if (BLOCK_TAGS.has(tagName) || BLOCK_CONTAINER_TAGS.has(tagName)) {
                flushPendingInlineNodes();
                if (tagName === "p") {
                    const lines = collectInlineLines(child.children);
                    if (lines.length > 0) {
                        blocks.push({ type: "paragraph", lines });
                    }
                } else {
                    blocks.push(...buildBlocksFromNode(child));
                }
                return;
            }
        }

        pendingInlineNodes.push(child);
    });

    flushPendingInlineNodes();

    if (blocks.length === 0) {
        return null;
    }

    return { blocks };
}

function buildBlockFromElement(element: Extract<ParsedHtmlNode, { type: "element" }>): PdfRichTextBlock[] {
    const { tagName } = element;

    if (tagName === "hr") {
        return [{ type: "rule" }];
    }

    if (tagName === "ul" || tagName === "ol") {
        const items = element.children
            .filter((child): child is Extract<ParsedHtmlNode, { type: "element" }> => child.type === "element" && child.tagName === "li")
            .map((child) => buildListItem(child))
            .filter((item): item is PdfRichTextListItem => Boolean(item));

        return items.length > 0
            ? [{ type: "list", ordered: tagName === "ol", items }]
            : [];
    }

    if (tagName === "blockquote") {
        const lines = collectInlineLines(element.children);
        return lines.length > 0 ? [{ type: "blockquote", lines }] : [];
    }

    if (/^h[1-6]$/.test(tagName)) {
        const lines = collectInlineLines(element.children);
        return lines.length > 0
            ? [{ type: "heading", level: Number.parseInt(tagName.slice(1), 10), lines }]
            : [];
    }

    if (tagName === "p") {
        const lines = collectInlineLines(element.children);
        return lines.length > 0 ? [{ type: "paragraph", lines }] : [];
    }

    if (BLOCK_CONTAINER_TAGS.has(tagName)) {
        return element.children.flatMap((child) => buildBlocksFromNode(child));
    }

    const fallbackLines = collectInlineLines([element]);
    return fallbackLines.length > 0 ? [{ type: "paragraph", lines: fallbackLines }] : [];
}

function buildBlocksFromNode(node: ParsedHtmlNode): PdfRichTextBlock[] {
    if (node.type === "text") {
        const lines = collectInlineLines([node]);
        return lines.length > 0 ? [{ type: "paragraph", lines }] : [];
    }

    if (node.type !== "element") {
        return [];
    }

    return buildBlockFromElement(node);
}

export function buildRichTextPdfBlocks(input: string): PdfRichTextBlock[] {
    const raw = typeof input === "string" ? input : "";
    if (!raw.trim()) return [];

    const rootNodes = parseSimpleHtml(raw);

    const blocks: PdfRichTextBlock[] = [];
    let pendingInlineNodes: ParsedHtmlNode[] = [];

    const flushPendingInlineNodes = () => {
        if (pendingInlineNodes.length === 0) return;
        const lines = collectInlineLines(pendingInlineNodes);
        if (lines.length > 0) {
            blocks.push({ type: "paragraph", lines });
        }
        pendingInlineNodes = [];
    };

    rootNodes.forEach((node) => {
        if (node.type === "element") {
            const { tagName } = node;
            if (BLOCK_TAGS.has(tagName) || BLOCK_CONTAINER_TAGS.has(tagName)) {
                flushPendingInlineNodes();
                blocks.push(...buildBlocksFromNode(node));
                return;
            }
        }
        pendingInlineNodes.push(node);
    });

    flushPendingInlineNodes();
    return blocks;
}

function setCursorX(doc: PdfDocLike, x: number) {
    doc.x = x;
}

function getContentWidth(doc: PdfDocLike, indent = 0) {
    return doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;
}

function renderLine(
    doc: PdfDocLike,
    segments: PdfRichTextLine,
    style: RenderBlockStyle,
    options: RenderRichTextPdfOptions,
    prefix?: string,
) {
    const x = doc.page.margins.left + (style.indent ?? 0);
    const width = getContentWidth(doc, style.indent ?? 0);
    const lineSegments = prefix ? [{ text: prefix }, ...segments] : segments;

    setCursorX(doc, x);

    lineSegments.forEach((segment, index) => {
        const isLast = index === lineSegments.length - 1;
        const wantsBold = Boolean(segment.bold || style.forceBold);
        const fontAlias = wantsBold && options.useBoldFont && options.fontAliases?.bold
            ? options.fontAliases.bold
            : options.fontAliases?.regular;
        const shouldStroke = wantsBold && !(options.useBoldFont && options.fontAliases?.bold);
        doc
            .font(fontAlias ?? options.fontAliases?.regular ?? "Helvetica")
            .fontSize(style.fontSize)
            .fillColor(style.textColor)
            .lineWidth(shouldStroke ? 0.35 : 0);

        doc.text(segment.text || " ", {
            width,
            lineGap: style.lineGap ?? 3,
            underline: segment.underline,
            strike: segment.strike,
            oblique: segment.italic ? 10 : false,
            continued: !isLast,
            fill: true,
            stroke: shouldStroke,
        });
    });

    doc.lineWidth(0);
}

function renderLines(
    doc: PdfDocLike,
    lines: PdfRichTextLine[],
    style: RenderBlockStyle,
    options: RenderRichTextPdfOptions,
    firstLinePrefix?: string,
) {
    lines.forEach((line, index) => {
        if (!isLineMeaningful(line)) {
            doc.moveDown(0.5);
            return;
        }
        renderLine(doc, line, style, options, index === 0 ? firstLinePrefix : undefined);
    });
}

function renderBlock(
    doc: PdfDocLike,
    block: PdfRichTextBlock,
    options: RenderRichTextPdfOptions,
    indentOffset: number,
    firstLinePrefix?: string,
) {
    const baseFontSize = options.baseFontSize ?? 12;

    switch (block.type) {
        case "paragraph":
            renderLines(doc, block.lines, {
                fontSize: baseFontSize,
                textColor: DEFAULT_TEXT_COLOR,
                indent: indentOffset,
            }, options, firstLinePrefix);
            break;
        case "heading":
            renderLines(doc, block.lines, {
                fontSize: headingFontSize(block.level, baseFontSize),
                textColor: DEFAULT_HEADING_COLOR,
                forceBold: true,
                lineGap: 4,
                indent: indentOffset,
            }, options, firstLinePrefix);
            break;
        case "blockquote": {
            const topY = doc.y;
            renderLines(doc, block.lines, {
                fontSize: baseFontSize,
                textColor: DEFAULT_QUOTE_COLOR,
                indent: indentOffset + 16,
            }, options, firstLinePrefix);
            const bottomY = doc.y;
            const borderX = doc.page.margins.left + indentOffset + 5;
            doc
                .strokeColor(DEFAULT_QUOTE_BORDER_COLOR)
                .lineWidth(1.5)
                .moveTo(borderX, topY)
                .lineTo(borderX, Math.max(topY + 10, bottomY - 4))
                .stroke()
                .lineWidth(0);
            break;
        }
        case "list":
            block.items.forEach((item, itemIndex) => {
                renderListItem(doc, item, block.ordered ? `${itemIndex + 1}. ` : "\u2022 ", options, indentOffset);
                if (itemIndex < block.items.length - 1) {
                    doc.moveDown(0.15);
                }
            });
            break;
        case "rule": {
            if (firstLinePrefix) {
                renderLine(doc, [], {
                    fontSize: baseFontSize,
                    textColor: DEFAULT_TEXT_COLOR,
                    indent: indentOffset,
                }, options, firstLinePrefix);
                doc.moveDown(0.1);
            }
            const y = doc.y + 4;
            doc
                .strokeColor(DEFAULT_RULE_COLOR)
                .lineWidth(1)
                .moveTo(doc.page.margins.left + indentOffset, y)
                .lineTo(doc.page.width - doc.page.margins.right, y)
                .stroke()
                .lineWidth(0);
            doc.moveDown(0.75);
            break;
        }
    }
}

function renderListItem(
    doc: PdfDocLike,
    item: PdfRichTextListItem,
    prefix: string,
    options: RenderRichTextPdfOptions,
    indentOffset: number,
) {
    const contentIndent = indentOffset + 14;
    const nestedListIndent = indentOffset + 28;
    let prefixRendered = false;

    if (item.blocks.length === 0) {
        renderLine(doc, [], {
            fontSize: options.baseFontSize ?? 12,
            textColor: DEFAULT_TEXT_COLOR,
            indent: contentIndent,
        }, options, prefix);
        return;
    }

    item.blocks.forEach((block, blockIndex) => {
        if (blockIndex > 0) {
            doc.moveDown(0.25);
        }

        if (!prefixRendered && (block.type === "list" || block.type === "rule")) {
            renderLine(doc, [], {
                fontSize: options.baseFontSize ?? 12,
                textColor: DEFAULT_TEXT_COLOR,
                indent: contentIndent,
            }, options, prefix);
            prefixRendered = true;
            doc.moveDown(0.1);
        }

        renderBlock(
            doc,
            block,
            options,
            block.type === "list" ? nestedListIndent : contentIndent,
            !prefixRendered ? prefix : undefined,
        );
        prefixRendered = true;
    });
}

function renderBlocks(
    doc: PdfDocLike,
    blocks: PdfRichTextBlock[],
    options: RenderRichTextPdfOptions,
    indentOffset = 0,
) {
    blocks.forEach((block, index) => {
        if (index > 0) {
            doc.moveDown(0.25);
        }
        renderBlock(doc, block, options, indentOffset);
    });
}

function headingFontSize(level: number, baseFontSize: number) {
    switch (level) {
        case 1:
            return baseFontSize + 8;
        case 2:
            return baseFontSize + 5;
        case 3:
            return baseFontSize + 3;
        default:
            return baseFontSize + 2;
    }
}

export function renderRichTextToPdf(
    doc: PdfDocLike,
    input: string,
    options: RenderRichTextPdfOptions = {},
) {
    const blocks = buildRichTextPdfBlocks(input);
    const baseFontSize = options.baseFontSize ?? 12;

    if (blocks.length === 0) {
        const plain = getRichTextPlainText(input);
        if (plain) {
            doc
                .font(options.fontAliases?.regular ?? "Helvetica")
                .fontSize(baseFontSize)
                .fillColor(DEFAULT_TEXT_COLOR)
                .text(plain, {
                lineGap: 3,
            });
        }
        return;
    }
    renderBlocks(doc, blocks, options, 0);
}
