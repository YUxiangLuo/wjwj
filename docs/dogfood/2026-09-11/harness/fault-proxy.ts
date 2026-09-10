/**
 * 故障注入代理：127.0.0.1:6469 -> 被测实例 127.0.0.1:6468。
 *
 * 存在的原因：agent-browser 的 network route 只能 abort 或替换 body，无法注入
 * 状态码与延迟；B-05/B-07 需要真实的 500 / 503 / 429 / 超时 响应。
 *
 * 只做两件事：
 *  1) 按规则返回故障响应（status / delay / malformed body）；
 *  2) 把浏览器发出的 Origin/Referer 重写为上游 origin，使被测服务的同源校验
 *     看到的是“同源客户端”，从而故障注入不会被 403 干扰。
 * 其余请求原样转发，不修改任何业务数据。
 *
 * 控制面（不转发）：
 *   PUT    /__fault/rules   {"rules":[{"id","method?","pathIncludes","times?","action":{...}}]}
 *   DELETE /__fault/rules   清空规则与计数
 *   GET    /__fault/stats   规则命中计数
 */
const UPSTREAM = process.env.FAULT_UPSTREAM ?? "http://127.0.0.1:6468";
const PORT = Number(process.env.FAULT_PORT ?? 6469);

interface FaultAction {
    type: "status" | "delay" | "raw" | "forwardThenFail";
    status?: number;
    code?: string;
    message?: string;
    ms?: number;
    body?: string;
    headers?: Record<string, string>;
}
interface FaultRule {
    id: string;
    method?: string;
    pathIncludes: string;
    times?: number;
    action: FaultAction;
}

let rules: FaultRule[] = [];
const stats: Record<string, number> = {};

function matches(rule: FaultRule, req: Request, url: URL) {
    if (rule.method && rule.method !== req.method) return false;
    return (url.pathname + url.search).includes(rule.pathIncludes);
}

function faultResponse(action: FaultAction) {
    const extra = new Headers(action.headers ?? {});
    if (action.type === "status") {
        if (!extra.has("Content-Type")) extra.set("Content-Type", "application/json");
        return new Response(JSON.stringify({
            success: false,
            error: { code: action.code ?? "FAULT_INJECTED", message: action.message ?? "注入的故障响应" },
        }), { status: action.status ?? 500, headers: extra });
    }
    if (action.type === "raw") {
        if (!extra.has("Content-Type")) extra.set("Content-Type", "application/json");
        return new Response(action.body ?? "", { status: action.status ?? 200, headers: extra });
    }
    throw new Error("delay 由调用方处理");
}

async function forward(req: Request, url: URL) {
    const target = new URL(url.pathname + url.search, UPSTREAM);
    const headers = new Headers(req.headers);
    headers.delete("host");
    // fetch 会自动解压上游响应，但会保留 Content-Encoding，导致浏览器二次解压失败。
    // 因此请求上游时不要协商压缩。
    headers.delete("accept-encoding");
    // 让被测服务看到的来源与它自己的 origin 一致（同源客户端语义）。
    if (headers.has("origin")) headers.set("origin", new URL(UPSTREAM).origin);
    if (headers.has("referer")) headers.set("referer", new URL(url.pathname, UPSTREAM).toString());
    const method = req.method;
    const body = method === "GET" || method === "HEAD" ? undefined : req.body;
    const upstream = await fetch(target, { method, headers, body, redirect: "manual", duplex: "half" } as RequestInit);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}

Bun.serve({
    hostname: "127.0.0.1",
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/__fault/rules") {
            if (req.method === "PUT") {
                const payload = await req.json() as { rules?: FaultRule[] };
                rules = payload.rules ?? [];
                for (const key of Object.keys(stats)) delete stats[key];
                return Response.json({ ok: true, count: rules.length });
            }
            if (req.method === "DELETE") {
                rules = [];
                for (const key of Object.keys(stats)) delete stats[key];
                return Response.json({ ok: true });
            }
            return Response.json({ rules, stats: { ...stats } });
        }

        const index = rules.findIndex((rule) => matches(rule, req, url));
        if (index >= 0) {
            const rule = rules[index]!;
            stats[rule.id] = (stats[rule.id] ?? 0) + 1;
            if (rule.times !== undefined) {
                rule.times -= 1;
                if (rule.times <= 0) rules.splice(index, 1);
            }
            if (rule.action.type === "delay") {
                // 观测客户端是否在延迟期间取消：B-07 需要证明离开页面会真正中止在途分析。
                const ms = rule.action.ms ?? 1000;
                const aborted = await new Promise<boolean>((resolve) => {
                    if (req.signal.aborted) { resolve(true); return; }
                    const timer = setTimeout(() => { req.signal.removeEventListener("abort", onAbort); resolve(false); }, ms);
                    function onAbort() { clearTimeout(timer); resolve(true); }
                    req.signal.addEventListener("abort", onAbort, { once: true });
                });
                if (aborted) {
                    stats[`${rule.id}:aborted`] = (stats[`${rule.id}:aborted`] ?? 0) + 1;
                    return new Response(null, { status: 499 });
                }
                return forward(req, url);
            }
            if (rule.action.type === "forwardThenFail") {
                // 先让上游真实处理（写入会提交），再向上返回失败：
                // 复现“服务端已提交但客户端拿不到响应”的不确定结果。
                await forward(req, url);
                return faultResponse({
                    type: "status",
                    status: rule.action.status ?? 502,
                    code: rule.action.code ?? "GATEWAY_ERROR",
                    message: rule.action.message ?? "网关在响应返回前中断",
                    headers: rule.action.headers,
                });
            }
            return faultResponse(rule.action);
        }

        return forward(req, url);
    },
});

console.log(`fault proxy on http://127.0.0.1:${PORT} -> ${UPSTREAM}`);
