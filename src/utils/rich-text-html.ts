import { getRichTextPlainText } from "./rich-text";

const ALLOWED_TAGS = new Set([
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
]);
const BLOCK_LIKE_TAGS = new Set(["div", "section", "article", "header", "footer"]);
const DROP_CONTENT_TAGS = new Set(["script", "style", "noscript"]);

function getDomParserConstructor(): typeof DOMParser | undefined {
    if (typeof globalThis.DOMParser !== "undefined") {
        return globalThis.DOMParser;
    }
    const w = globalThis as typeof globalThis & { window?: { DOMParser?: typeof DOMParser } };
    if (typeof w.window?.DOMParser !== "undefined") {
        return w.window.DOMParser;
    }
    return undefined;
}

function escapeHtml(input: string) {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function sanitizeTextNodeContent(input: string, safeDoc: Document): Node[] {
    const normalized = input.replace(/\r\n?/g, "\n");
    if (!normalized.includes("\n")) {
        return [safeDoc.createTextNode(normalized)];
    }

    // Ignore formatting-only whitespace between tags to avoid introducing extra line breaks.
    if (!normalized.trim()) {
        return [];
    }

    const parts = normalized.split("\n");
    const nodes: Node[] = [];

    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? "";
        if (part.length > 0) {
            nodes.push(safeDoc.createTextNode(part));
        }
        if (index < parts.length - 1) {
            nodes.push(safeDoc.createElement("br"));
        }
    }

    return nodes;
}

function sanitizeNode(node: Node, safeDoc: Document): Node[] {
    if (node.nodeType === Node.TEXT_NODE) {
        return sanitizeTextNodeContent(node.textContent ?? "", safeDoc);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return [];
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    if (DROP_CONTENT_TAGS.has(tagName)) {
        return [];
    }

    const childNodes = Array.from(element.childNodes).flatMap((child) => sanitizeNode(child, safeDoc));

    if (!ALLOWED_TAGS.has(tagName)) {
        if (BLOCK_LIKE_TAGS.has(tagName) && childNodes.length > 0) {
            return [...childNodes, safeDoc.createElement("br")];
        }
        return childNodes;
    }

    if (tagName === "br") {
        return [safeDoc.createElement("br")];
    }

    if (tagName === "hr") {
        return [safeDoc.createElement("hr")];
    }

    const cleaned = safeDoc.createElement(tagName);
    childNodes.forEach((child) => cleaned.appendChild(child));

    if ((tagName === "ul" || tagName === "ol") && cleaned.children.length === 0) {
        return [];
    }

    return [cleaned];
}

export function sanitizeRichTextHtml(input: string): string {
    const raw = typeof input === "string" ? input : "";
    if (!raw.trim()) return "";

    const ParserClass = getDomParserConstructor();
    if (!ParserClass) {
        const plain = getRichTextPlainText(raw);
        return plain ? escapeHtml(plain).replace(/\n/g, "<br>") : "";
    }

    const parser = new ParserClass();
    const parsed = parser.parseFromString(`<div>${raw}</div>`, "text/html");
    const sourceRoot = parsed.body.firstElementChild ?? parsed.body;
    const safeDoc = parsed.implementation.createHTMLDocument("safe-rich-text");
    const safeRoot = safeDoc.createElement("div");

    Array.from(sourceRoot.childNodes)
        .flatMap((node) => sanitizeNode(node, safeDoc))
        .forEach((node) => safeRoot.appendChild(node));

    return safeRoot.innerHTML
        .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
        .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
        .trim();
}

export function normalizeRichTextHtml(input: string): string {
    const sanitized = sanitizeRichTextHtml(input);
    return getRichTextPlainText(sanitized).length === 0 ? "" : sanitized;
}
