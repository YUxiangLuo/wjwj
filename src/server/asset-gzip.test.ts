import { expect, test } from "bun:test";
import { acceptsGzip, createGzipCache } from "./asset-gzip";

test("acceptsGzip honors q-values and ignores gzip;q=0", () => {
    expect(acceptsGzip(null)).toBe(false);
    expect(acceptsGzip("gzip")).toBe(true);
    expect(acceptsGzip("gzip, deflate")).toBe(true);
    expect(acceptsGzip("deflate, gzip;q=1.0")).toBe(true);
    expect(acceptsGzip("gzip;q=0")).toBe(false);
    expect(acceptsGzip("gzip;q=0.0, deflate")).toBe(false);
    expect(acceptsGzip("deflate")).toBe(false);
});

test("gzip cache compresses each asset name once", () => {
    const cache = createGzipCache();
    const source = new TextEncoder().encode("console.log('hello')");
    const first = cache.get("app.hash.js", source);
    const second = cache.get("app.hash.js", new TextEncoder().encode("different bytes ignored after cache"));
    expect(first.byteLength).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(cache.get("other.hash.js", source)).not.toBe(first);
});
