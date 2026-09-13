export type JsonDocument = Record<string, unknown> | unknown[];

export function isJsonDocument(value: unknown): value is JsonDocument {
    if (Array.isArray(value)) return true;
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export class InvalidJsonbStorageError extends Error {
    constructor() { super("JSONB 存储格式无效，请联系管理员检查；不会解包字符串或将损坏内容当作空数据。"); this.name = "InvalidJsonbStorageError"; }
}

/** Native JSONB only. Absence is optional; malformed present data is never an empty state. */
export function readStoredDocument<T = JsonDocument>(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    if (!isJsonDocument(value)) throw new InvalidJsonbStorageError();
    return value as T;
}
