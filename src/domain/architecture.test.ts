import { expect, test } from "bun:test";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("domain calculations and contracts do not depend on applications or host services", async () => {
    const visited = new Set<string>();
    async function inspect(path: string) {
        if (visited.has(path)) return;
        visited.add(path);
        const relativePath = relative(root, path);
        expect(relativePath).not.toMatch(/^src\/(?:student|teacher|admin|db|server|components|hooks)\//);
        const source = (await Bun.file(path).text()).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
        expect(source).not.toMatch(/\b(?:process|Bun|window|document|localStorage)\s*\./);
        expect(source).not.toMatch(/\bfetch\s*\(/);
        for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
            const specifier = match[1]!;
            expect(specifier).not.toMatch(/^(?:node:|bun$|react(?:$|\/)|drizzle-orm)/);
            if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
            const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : resolve(dirname(path), specifier);
            const target = /\.tsx?$/.test(base) ? base : `${base}.ts`;
            await inspect(target);
        }
    }
    for await (const path of new Bun.Glob("src/domain/**/*.ts").scan({ cwd: root })) {
        if (!path.endsWith(".test.ts")) await inspect(resolve(root, path));
    }
    expect(visited.size).toBeGreaterThan(0);
});
