/** DG 轮次共用测试客户端：真实 HTTP，不导入产品业务模块。 */
export type Jar = Map<string, string>;
export function cookieHeader(jar: Jar) { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }

export class Client {
  jar: Jar = new Map();
  constructor(readonly base: string) {}
  async call(method: string, path: string, init: { json?: unknown; form?: FormData; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (this.jar.size) headers.Cookie = cookieHeader(this.jar);
    let body: BodyInit | undefined;
    if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    else if (init.form) body = init.form;
    const res = await fetch(this.base + path, { method, headers, body });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(";", 1)[0]!; const i = pair.indexOf("=");
      const k = pair.slice(0, i); const v = pair.slice(i + 1);
      if (v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* text */ }
    return { status: res.status, body: parsed as any, text, headers: res.headers };
  }
}

export interface Check { name: string; ok: boolean; detail: string }
export class Suite {
  checks: Check[] = [];
  constructor(readonly id: string) {}
  check(name: string, ok: boolean, detail: string) { this.checks.push({ name, ok, detail }); }
  get status() { return this.checks.every((c) => c.ok) ? "PASS" : "FAIL"; }
}

export function excerpt(v: unknown, n = 180) {
  const t = typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
export function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`PREP FAILED: ${msg}`); }

export async function writeSuites(path: string, suites: Suite[]) {
  await Bun.write(path, JSON.stringify(suites.map((s) => ({ id: s.id, status: s.status, checks: s.checks })), null, 2));
  const lines = suites.map((s) => JSON.stringify({
    id: s.id, status: s.status, checks: s.checks,
    failed: s.checks.filter((c) => !c.ok).map((c) => `${c.name} => ${c.detail}`),
    testedAt: new Date().toISOString(),
  }));
  await Bun.write(path.replace(/\.json$/, ".jsonl"), lines.join("\n") + "\n");
  const failed = suites.flatMap((s) => s.checks.filter((c) => !c.ok));
  console.log(JSON.stringify({ suites: suites.map((s) => `${s.id}:${s.status}(${s.checks.filter(c=>c.ok).length}/${s.checks.length})`), failed: failed.length }, null, 2));
  if (failed.length) process.exitCode = 1;
}
