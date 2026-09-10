/**
 * R5 负载发生器（独立进程；不与被测服务共享事件循环）。
 *
 *   MODE=login CONCURRENCY=50 STUDENTS=50 BASE_URL=http://127.0.0.1:6470 bun evidence/r5/harness/r5-load.ts
 *
 * 客户端行为与产品一致：仅在 429/503 且 code=AUTH_BUSY 时重试，最多 3 次，
 * 退避 max(1000*2^attempt, Retry-After) + 0..250ms 抖动（对应 fetchWithBusyRetry）。
 *
 * 同时运行两个探针，用于测量"主线程/数据库在登录风暴期间是否还响应"：
 *  - static：GET /student（静态 HTML，测主线程）
 *  - authed：带一个已登录会话 GET /api/student/tasks（测 DB + 主线程）
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6470";
const MODE = process.env.MODE ?? "login";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const STUDENT_COUNT = Number(process.env.STUDENTS ?? 50);
const OUT = process.env.OUT ?? `evidence/r5/load-${MODE}-c${CONCURRENCY}.json`;
const PREFIX = process.env.STUDENT_PREFIX ?? "L5";

type Jar = Map<string, string>;

function cookieHeader(jar: Jar) {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbCookies(jar: Jar, response: Response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
        const pair = cookie.split(";", 1)[0]!; const eq = pair.indexOf("=");
        const name = pair.slice(0, eq); const value = pair.slice(eq + 1);
        if (value === "") jar.delete(name); else jar.set(name, value);
    }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 单次请求（不重试）。 */
async function send(jar: Jar, method: string, path: string, json?: unknown) {
    const headers: Record<string, string> = {};
    if (jar.size) headers.Cookie = cookieHeader(jar);
    let body: BodyInit | undefined;
    if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    const response = await fetch(BASE + path, { method, headers, body });
    absorbCookies(jar, response);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* text */ }
    return { status: response.status, body: parsed as any, headers: response.headers };
}

interface Attempt { attempts: number; retries: number; busy: number; status: number; ms: number; ok: boolean; identityOk: boolean | null; }

async function loginWithRetry(studentId: string): Promise<Attempt> {
    const jar: Jar = new Map();
    const started = performance.now();
    let attempts = 0; let retries = 0; let busy = 0; let status = 0;
    let identityOk: boolean | null = null;
    for (;;) {
        attempts += 1;
        try {
            const res = await send(jar, "POST", "/api/student/login", { studentId, password: studentId });
            status = res.status;
            if (res.status === 200) {
                const me = await send(jar, "GET", "/api/student/me");
                identityOk = me.status === 200 && me.body?.data?.studentId === studentId;
                return { attempts, retries, busy, status, ms: performance.now() - started, ok: identityOk === true, identityOk };
            }
            const code = res.body?.error?.code ?? "";
            if ((res.status === 429 || res.status === 503) && code === "AUTH_BUSY") {
                busy += 1;
                if (retries >= 3) return { attempts, retries, busy, status, ms: performance.now() - started, ok: false, identityOk };
                const header = res.headers.get("Retry-After");
                const seconds = header === null ? Number.NaN : Number(header);
                const retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0;
                retries += 1;
                await sleep(Math.max(1000 * 2 ** (retries - 1), retryAfterMs) + Math.floor(Math.random() * 250));
                continue;
            }
            return { attempts, retries, busy, status, ms: performance.now() - started, ok: false, identityOk };
        } catch (error) {
            return { attempts, retries, busy, status: -1, ms: performance.now() - started, ok: false, identityOk };
        }
    }
}

function percentile(sorted: number[], p: number) {
    if (sorted.length === 0) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return Number(sorted[index]!.toFixed(1));
}

function summarize(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
    return {
        count: sorted.length,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted.length ? Number(sorted.at(-1)!.toFixed(1)) : null,
        mean: mean === null ? null : Number(mean.toFixed(1)),
    };
}

// -------------------------------------------------------------- probes

interface ProbeResult { label: string; samples: number[]; failures: number; }
let probing = true;

async function probe(label: string, jar: Jar, path: string, intervalMs: number): Promise<ProbeResult> {
    const result: ProbeResult = { label, samples: [], failures: 0 };
    while (probing) {
        const started = performance.now();
        try {
            const res = await send(jar, "GET", path);
            if (res.status >= 500) result.failures += 1;
            result.samples.push(performance.now() - started);
        } catch {
            result.failures += 1;
        }
        await sleep(intervalMs);
    }
    return result;
}

// -------------------------------------------------------------- main

const POOL = Number(process.env.POOL ?? 50);
const students = Array.from({ length: STUDENT_COUNT }, (_, i) => `${PREFIX}${String((i % POOL) + 1).padStart(4, "0")}`);

// 一个已登录会话用于 authed 探针
const probeJar: Jar = new Map();
{
    const res = await send(probeJar, "POST", "/api/student/login", { studentId: students[0]!, password: students[0]! });
    if (res.status !== 200) throw new Error(`探针会话登录失败：${res.status} ${JSON.stringify(res.body)}`);
}

const probePromises: Promise<ProbeResult>[] = [
    probe("static:/student", new Map(), "/student", 250),
    probe("authed:/api/student/tasks", probeJar, "/api/student/tasks", 300),
];

const wall = performance.now();
const results: Attempt[] = new Array(students.length);
let next = 0;
async function worker() {
    while (true) {
        const index = next; next += 1;
        if (index >= students.length) return;
        results[index] = await loginWithRetry(students[index]!);
    }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, students.length) }, worker));
const wallMs = performance.now() - wall;

probing = false;
const probeResults = await Promise.all(probePromises);

const summary = {
    scenario: "login",
    base: BASE,
    concurrency: CONCURRENCY,
    students: students.length,
    wallMs: Number(wallMs.toFixed(1)),
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    identityMismatch: results.filter((r) => r.identityOk === false).length,
    busyResponses: results.reduce((sum, r) => sum + r.busy, 0),
    totalAttempts: results.reduce((sum, r) => sum + r.attempts, 0),
    totalRetries: results.reduce((sum, r) => sum + r.retries, 0),
    latencyMs: summarize(results.map((r) => r.ms)),
    failures: results.filter((r) => !r.ok).map((r) => ({ status: r.status, attempts: r.attempts, ms: Number(r.ms.toFixed(1)) })).slice(0, 10),
    probes: probeResults.map((p) => ({ label: p.label, failures: p.failures, latencyMs: summarize(p.samples) })),
};

await Bun.write(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
