import { expect, test } from "bun:test";
import { isSameOriginWriteRequest, rejectCrossSiteRequest } from "./http";

test("same-origin guard allows safe methods without origin headers", () => {
    const req = new Request("https://app.example.test/api/admin/settings", { method: "GET" });

    expect(isSameOriginWriteRequest(req)).toBe(true);
    expect(rejectCrossSiteRequest(req)).toBeNull();
});

test("same-origin guard allows write requests without browser origin metadata", () => {
    const req = new Request("https://app.example.test/api/admin/settings", { method: "POST" });

    expect(isSameOriginWriteRequest(req)).toBe(true);
    expect(rejectCrossSiteRequest(req)).toBeNull();
});

test("same-origin guard accepts matching Origin header", () => {
    const req = new Request("https://app.example.test/api/admin/settings", {
        method: "PUT",
        headers: { Origin: "https://app.example.test" },
    });

    expect(isSameOriginWriteRequest(req)).toBe(true);
});

test("same-origin guard rejects mismatched Origin header", async () => {
    const req = new Request("https://app.example.test/api/admin/settings", {
        method: "POST",
        headers: { Origin: "https://evil.example.test" },
    });

    const response = rejectCrossSiteRequest(req);
    const body = await response?.json();

    expect(response?.status).toBe(403);
    expect(body.error.code).toBe("CSRF_ORIGIN_MISMATCH");
});

test("same-origin guard respects forwarded external origin", () => {
    const req = new Request("http://127.0.0.1:3000/api/admin/settings", {
        method: "POST",
        headers: {
            Origin: "https://app.example.test",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "app.example.test",
        },
    });

    expect(isSameOriginWriteRequest(req)).toBe(true);
});

test("same-origin guard canonicalizes forwarded default ports", () => {
    const req = new Request("http://127.0.0.1:3000/api/admin/settings", {
        method: "POST",
        headers: {
            Origin: "https://app.example.test",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "app.example.test:443",
        },
    });

    expect(isSameOriginWriteRequest(req)).toBe(true);
});

test("same-origin guard rejects cross-site fetch metadata", () => {
    const req = new Request("https://app.example.test/api/admin/settings", {
        method: "POST",
        headers: {
            Origin: "https://app.example.test",
            "sec-fetch-site": "cross-site",
        },
    });

    expect(isSameOriginWriteRequest(req)).toBe(false);
});
