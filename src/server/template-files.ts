import { resolve, sep } from "node:path";

const templatesDir = resolve(process.cwd(), "public", "templates");

export function resolveTemplatePath(rawName: string): string | null {
    let decodedName = rawName?.trim();
    try {
        decodedName = decodeURIComponent(decodedName);
    } catch {
        return null;
    }
    if (!decodedName) return null;
    if (decodedName.includes("/") || decodedName.includes("\\")) return null;

    const fullPath = resolve(templatesDir, decodedName);
    const isInsideTemplates = fullPath === templatesDir || fullPath.startsWith(`${templatesDir}${sep}`);
    if (!isInsideTemplates || fullPath === templatesDir) return null;

    return fullPath;
}

export function getTemplateContentType(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/octet-stream";
}

export function getTemplateContentDisposition(fileName: string) {
    const lower = fileName.toLowerCase();
    const mode = lower.endsWith(".csv") || lower.endsWith(".docx") ? "attachment" : "inline";
    return `${mode}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
