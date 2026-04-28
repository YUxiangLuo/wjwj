import { expect, mock, test } from "bun:test";
import { parseJsonApiResponse } from "./api-response";

test("parseJsonApiResponse returns parsed JSON and invokes the interceptor", async () => {
    const interceptor = mock(() => {});
    const response = new Response(JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "expired" },
    }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
    });

    const parsed = await parseJsonApiResponse("/api/example", response, interceptor);

    expect(parsed).toEqual({
        success: false,
        error: { code: "UNAUTHORIZED", message: "expired" },
    });
    expect(interceptor).toHaveBeenCalledWith("/api/example", 401, parsed);
});

test("parseJsonApiResponse converts non-json responses to INVALID_RESPONSE", async () => {
    const interceptor = mock(() => {});
    const response = new Response("<html>bad gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
    });

    const parsed = await parseJsonApiResponse("/api/example", response, interceptor);

    expect(parsed).toEqual({
        success: false,
        error: {
            code: "INVALID_RESPONSE",
            message: "服务器返回了非预期的响应 (502)",
        },
    });
    expect(interceptor).not.toHaveBeenCalled();
});

test("parseJsonApiResponse converts malformed json responses to INVALID_RESPONSE", async () => {
    const response = new Response("{", {
        status: 500,
        headers: { "Content-Type": "application/json" },
    });

    const parsed = await parseJsonApiResponse("/api/example", response);

    expect(parsed.error?.code).toBe("INVALID_RESPONSE");
});
