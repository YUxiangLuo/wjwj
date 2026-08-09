import { expect, test } from "bun:test";
import { handleServerError, InvalidJsonError, json, parseBody, stringValue } from "./http";

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
