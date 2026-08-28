export function acceptsGzip(acceptEncoding: string | null | undefined): boolean {
    if (!acceptEncoding) return false;
    for (const part of acceptEncoding.split(",")) {
        const pieces = part.trim().split(";").map((item) => item.trim());
        const coding = pieces[0]?.toLowerCase();
        if (coding !== "gzip") continue;
        let q = 1;
        for (const param of pieces.slice(1)) {
            const [name, rawValue] = param.split("=").map((item) => item.trim());
            if (name?.toLowerCase() !== "q") continue;
            const value = Number(rawValue);
            q = Number.isFinite(value) ? value : 0;
        }
        return q > 0;
    }
    return false;
}

export function createGzipCache() {
    const cache = new Map<string, Uint8Array<ArrayBuffer>>();
    return {
        get(name: string, source: Uint8Array): Uint8Array<ArrayBuffer> {
            const hit = cache.get(name);
            if (hit) return hit;
            const compressed = Bun.gzipSync(new Uint8Array(source));
            cache.set(name, compressed);
            return compressed;
        },
    };
}
