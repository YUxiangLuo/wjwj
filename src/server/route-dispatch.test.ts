import { expect, test } from "bun:test";
import { routeTableWithMethodNotAllowed } from "./route-dispatch";

const table = routeTableWithMethodNotAllowed({
    "/api/thing": { GET: () => Response.json({ ok: true }), PUT: () => Response.json({ ok: true }) },
    "/api/write-only": { POST: () => Response.json({ ok: true }) },
});

test("declared methods reach their handler", async () => {
    expect((await table["/api/thing"]!(new Request("https://example.com/api/thing"))).status).toBe(200);
    expect((await table["/api/thing"]!(new Request("https://example.com/api/thing", { method: "PUT" }))).status).toBe(200);
    expect((await table["/api/write-only"]!(new Request("https://example.com/api/write-only", { method: "POST" }))).status).toBe(200);
});

test("an undeclared method answers 405 with the allowed set instead of a misleading 404", async () => {
    const response = await table["/api/thing"]!(new Request("https://example.com/api/thing", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD, PUT");
});

test("HEAD reuses the GET handler for read paths and is not allowed on write-only paths", async () => {
    expect((await table["/api/thing"]!(new Request("https://example.com/api/thing", { method: "HEAD" }))).status).toBe(200);

    const response = await table["/api/write-only"]!(new Request("https://example.com/api/write-only", { method: "HEAD" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
});
