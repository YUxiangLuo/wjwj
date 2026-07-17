/**
 * 任务截止时间：教师端用「本地墙钟」编辑，提交与 API 传输使用 ISO-8601 UTC（…Z）。
 * 数据库存储由 Drizzle/Bun SQL 将 JS Date 写入 PostgreSQL timestamptz；JSON 响应中 Date 序列化为 UTC ISO。
 */

/** 解析 `YYYY-MM-DDTHH:mm`（浏览器本地日历/时分），与 DatetimePicker24 存储一致 */
export function parseLocalDateTime(value: string): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const [, ys, ms, ds, hs, mins] = m;
    const d = new Date(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** 本地墙钟 → `YYYY-MM-DDTHH:mm`（供选择器受控值） */
export function toLocalDateTimeString(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${day}T${hh}:${mm}`;
}

/** 本地墙钟串 → UTC ISO，用于 `createTask` / `extendTaskDeadline` 请求体 */
export function localWallClockToUtcIso(local: string): string | undefined {
    const t = local.trim();
    if (!t) return undefined;
    const d = parseLocalDateTime(t);
    if (!d) return undefined;
    return d.toISOString();
}

/**
 * 日期时间选择器：受控值可能是本地墙钟串，或接口返回的 ISO UTC 串。
 * 统一解析为 Date（本地展示用 getHours/getDate 等）。
 */
export function parsePickerValue(value: string): Date | null {
    if (!value.trim()) return null;
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
        return parseLocalDateTime(v);
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}
