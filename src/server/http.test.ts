import { expect, test } from "bun:test";
import {
    handleServerError,
    InvalidJsonError,
    json,
    MAX_JSON_BODY_BYTES,
    parseBody,
    parsePositiveInteger,
    RequestBodyTooLargeError,
    stringValue,
    validateApiRequest,
    withPrivateApiHeaders,
    getEffectiveRequestOrigin,
} from "./http";

test("parseBody parses valid JSON", async () => {
    const request = new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "抽样实验" }),
    });

    expect(await parseBody<{ name: string }>(request)).toEqual({ name: "抽样实验" });
});

test("parseBody classifies empty and malformed request bodies as invalid JSON", async () => {
    for (const body of ["", "{bad"]) {
        const request = new Request("http://localhost/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });

        let caught: unknown;
        try {
            await parseBody(request);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(InvalidJsonError);
    }
});

test("parseBody rejects declared and streamed JSON bodies above 256 KiB", async () => {
    const declared = new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
        body: "{}",
    });
    await expect(parseBody(declared)).rejects.toBeInstanceOf(RequestBodyTooLargeError);

    const streamed = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) }),
    });
    let caught: unknown;
    try {
        await parseBody(streamed);
    } catch (error) {
        caught = error;
    }
    expect(caught).toBeInstanceOf(RequestBodyTooLargeError);
    const response = handleServerError(caught);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
});

test("parseBody rejects syntactically valid JSON that is not an object", async () => {
    for (const body of ["null", "[]", "true", "1", '"text"']) {
        const request = new Request("http://localhost/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });

        let caught: unknown;
        try {
            await parseBody(request);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(InvalidJsonError);
        expect((caught as Error).message).toBe("请求体必须是 JSON 对象");
    }
});

test("stringValue accepts only runtime strings", () => {
    expect(stringValue(" S001 ")).toBe(" S001 ");
    for (const value of [null, undefined, 1, true, [], {}]) expect(stringValue(value)).toBe("");
});

test("positive integer parser rejects non-canonical and unsafe identifiers", () => {
    expect(parsePositiveInteger("10")).toBe(10);
    for (const value of ["10abc", "1.5", "1e2", "01", "-1", "0", "9007199254740992"]) {
        expect(parsePositiveInteger(value)).toBeNull();
    }
});

test("JSON responses include baseline browser security headers without dropping caller headers", () => {
    const response = json({ ok: true }, 200, { "Set-Cookie": "session=test; HttpOnly" });

    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("set-cookie")).toBe("session=test; HttpOnly");
});

test("handleServerError returns the standard 400 payload for invalid JSON", async () => {
    const response = handleServerError(new InvalidJsonError());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
        success: false,
        error: {
            code: "INVALID_JSON",
            message: "请求体不是有效的 JSON",
        },
    });
});

test("API request guard rejects cross-site and non-JSON mutation bodies", async () => {
    const crossSite = validateApiRequest(new Request("https://app.example/api/student/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
        body: "{}",
    }));
    expect(crossSite?.status).toBe(403);

    const text = validateApiRequest(new Request("https://app.example/api/student/stage", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
    }));
    expect(text?.status).toBe(415);

    const badReferer = validateApiRequest(new Request("https://app.example/api/student/stage", {
        method: "DELETE",
        headers: { Referer: "https://evil.example/page" },
    }));
    expect(badReferer?.status).toBe(403);

    expect(validateApiRequest(new Request("https://app.example/api/student/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://app.example" },
        body: "{}",
    }))).toBeNull();
});

test("authenticated API wrapper always emits a private no-store policy", () => {
    const response = withPrivateApiHeaders(json({ studentId: "S001" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
});

test("trusted proxy origin validation reconstructs the public HTTPS origin", () => {
    const previous = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
        const request = new Request("http://127.0.0.1:3000/api/student/login", {
            method: "POST",
            headers: {
                Host: "app.example.edu",
                Origin: "https://app.example.edu",
                "X-Forwarded-Proto": "https",
                "Content-Type": "application/json",
            },
            body: "{}",
        });
        expect(getEffectiveRequestOrigin(request)).toBe("https://app.example.edu");
        expect(validateApiRequest(request)).toBeNull();
    } finally {
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
    }
});
