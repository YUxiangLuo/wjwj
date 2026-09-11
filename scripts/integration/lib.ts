// 联动测试共用骨架：带 cookie 的 HTTP 客户端 + 断言收集器。
// 运行：bun scripts/integration/lib.ts（或由 round*.ts 引入）

export const BASE = process.env.INTEGRATION_BASE ?? "http://127.0.0.1:3100";

export interface Result<T = any> {
    status: number;
    body: T;
    text: string;
}

export class Client {
    private cookies = new Map<string, string>();
    constructor(private label: string) {}

    get name() {
        return this.label;
    }

    private cookieHeader() {
        return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }

    private absorb(response: Response) {
        const raw = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
            ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
        for (const entry of raw) {
            for (const part of entry.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
                const pair = part.trim().split(";")[0]!;
                const index = pair.indexOf("=");
                if (index <= 0) continue;
                const name = pair.slice(0, index).trim();
                const value = pair.slice(index + 1).trim();
                if (/expires=Thu, 01 Jan 1970/i.test(part) || value === "") this.cookies.delete(name);
                else this.cookies.set(name, value);
            }
        }
    }

    async req(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<Result> {
        const headers = new Headers(init.headers);
        let payload: BodyInit | undefined;
        if (body instanceof FormData) {
            payload = body;
        } else if (body !== undefined) {
            headers.set("Content-Type", "application/json");
            payload = JSON.stringify(body);
        }
        const cookie = this.cookieHeader();
        if (cookie) headers.set("Cookie", cookie);

        let response: Response;
        try {
            response = await fetch(`${BASE}${path}`, { ...init, method, headers, body: payload, redirect: "manual" });
        } catch (error) {
            return { status: 0, body: null, text: `NETWORK_ERROR: ${(error as Error).message}` };
        }
        this.absorb(response);
        const text = await response.text();
        let parsed: any = text;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            /* html or csv */
        }
        return { status: response.status, body: parsed, text };
    }

    get = (path: string, init?: RequestInit) => this.req("GET", path, undefined, init);
    post = (path: string, body?: unknown) => this.req("POST", path, body);
    put = (path: string, body?: unknown) => this.req("PUT", path, body);
    del = (path: string) => this.req("DELETE", path);

    async login(path: string, payload: unknown) {
        const result = await this.post(path, payload);
        return result;
    }
}

export class Suite {
    readonly checks: Array<{ id: string; title: string; ok: boolean; detail: string }> = [];
    readonly issues: Array<{ kind: string; title: string; detail: string }> = [];
    private readonly started = Date.now();

    check(id: string, title: string, ok: boolean, detail = "") {
        this.checks.push({ id, title, ok, detail });
        const icon = ok ? "✅" : "❌";
        console.log(`${icon} ${id} ${title}${detail ? ` — ${detail}` : ""}`);
        return ok;
    }

    eq(id: string, title: string, actual: unknown, expected: unknown) {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        return this.check(id, title, ok, ok ? `= ${JSON.stringify(actual)}` : `实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }

    issue(kind: string, title: string, detail: string) {
        this.issues.push({ kind, title, detail });
        console.log(`⚠️  [${kind}] ${title} — ${detail}`);
    }

    summary() {
        const failed = this.checks.filter((check) => !check.ok);
        const elapsed = ((Date.now() - this.started) / 1000).toFixed(1);
        console.log(`\n== ${failed.length ? "存在失败项" : "全部通过"} == ${this.checks.length - failed.length}/${this.checks.length} 通过，${this.issues.length} 条记录，用时 ${elapsed}s`);
        return { checks: this.checks, issues: this.issues, passed: this.checks.length - failed.length, total: this.checks.length };
    }
}

/** 证据目录：test-results/ 已被 gitignore，路径相对本文件而非 cwd。 */
export const EVIDENCE_DIR = new URL("../../test-results/integration-2026-09-11/", import.meta.url).pathname;

export async function writeResult(file: string, payload: unknown) {
    await Bun.write(file, JSON.stringify(payload, null, 2));
}

export function evidenceFile(name: string) {
    return `${EVIDENCE_DIR}${name}`;
}

/** 生成 CSV 文本：含逗号/引号/换行的字段按 RFC 4180 加引号。 */
export function csv(headers: string[], rows: Array<Array<string | number>>) {
    const cell = (value: string | number) => {
        const text = String(value);
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

export function formFile(name: string, content: string, type = "text/csv") {
    const form = new FormData();
    form.append("file", new File([content], name, { type }));
    return form;
}

/** 轮询等待条件成立（用于跨端可见性：一端写入后另一端多久能看到）。 */
export async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 5_000, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs;
    let last = await fn();
    while (Date.now() < deadline) {
        if (predicate(last)) return { ok: true as const, value: last, elapsedMs: timeoutMs - (deadline - Date.now()) };
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        last = await fn();
    }
    return { ok: false as const, value: last, elapsedMs: timeoutMs };
}
