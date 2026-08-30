import tailwind from "bun-plugin-tailwind";
import { rm, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { countHardcodedPaletteClasses } from "./check-styles";

const projectRoot = resolve(import.meta.dir, "..");
const outdir = resolve(projectRoot, process.env.BUILD_OUTDIR ?? "dist");
const entrypoints = [
    "src/admin/admin.html",
    "src/teacher/teacher.html",
    "src/student/student.html",
];

function isChildPath(parent: string, candidate: string) {
    const path = relative(parent, candidate);
    return path !== "" && !path.startsWith("..") && !parse(path).root;
}

if (!isChildPath(projectRoot, outdir) && !isChildPath(resolve(tmpdir()), outdir)) {
    throw new Error(`拒绝清理不安全的构建目录：${outdir}`);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

let outputCount = 0;
const MAX_INITIAL_JS_GZIP_BYTES = 350 * 1024;
const MAX_FONT_BYTES = 300 * 1024;

// Building the HTML entrypoints separately lets identical minified Tailwind
// chunks share their content hash without Bun treating the shared path as an
// intra-build collision.
for (const entrypoint of entrypoints) {
    const result = await Bun.build({
        entrypoints: [entrypoint],
        outdir,
        plugins: [tailwind],
        target: "browser",
        splitting: true,
        publicPath: "/",
        define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
            // Production must never skip the first-login password gates, even
            // when a stale development environment exports DEV_AUTH_MODE=1.
            "process.env.DEV_AUTH_MODE": JSON.stringify("0"),
        },
        minify: true,
    });

    for (const log of result.logs) console.warn(log);
    if (!result.success) process.exit(1);

    const invalidCssOutputs: Array<{ path: string; count: number }> = [];
    for (const output of result.outputs) {
        if (!output.path.endsWith(".css")) continue;
        const count = countHardcodedPaletteClasses(await output.text());
        if (count > 0) invalidCssOutputs.push({ path: output.path, count });
    }
    if (invalidCssOutputs.length > 0) {
        console.error("Production CSS contains forbidden hardcoded palette utilities:");
        for (const output of invalidCssOutputs) {
            console.error(`- ${output.path}: ${output.count}`);
        }
        process.exit(1);
    }

    outputCount += result.outputs.length;
}

async function collectInitialJavaScript(entryFile: string, seen = new Set<string>()) {
    if (seen.has(entryFile)) return seen;
    seen.add(entryFile);
    const source = await Bun.file(resolve(outdir, entryFile)).text();
    for (const match of source.matchAll(/(?:from|import)"\/(chunk-[^"]+\.js)"/g)) {
        const imported = match[1];
        if (imported) await collectInitialJavaScript(imported, seen);
    }
    return seen;
}

for (const entrypoint of entrypoints) {
    const htmlName = `${parse(entrypoint).name}.html`;
    const html = await Bun.file(resolve(outdir, htmlName)).text();
    const entryScript = html.match(/src="\/(chunk-[^"]+\.js)"/)?.[1];
    if (!entryScript) throw new Error(`${htmlName} 缺少生产入口脚本`);

    const initialFiles = await collectInitialJavaScript(entryScript);
    let initialGzipBytes = 0;
    for (const fileName of initialFiles) {
        initialGzipBytes += gzipSync(await Bun.file(resolve(outdir, fileName)).arrayBuffer()).byteLength;
    }
    if (initialGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
        throw new Error(`${htmlName} 首屏静态 JS 为 ${initialGzipBytes} bytes gzip，超过 ${MAX_INITIAL_JS_GZIP_BYTES} bytes 预算`);
    }
    console.log(`${htmlName} initial static JS: ${initialGzipBytes} bytes gzip across ${initialFiles.size} files.`);
}

for (const fileName of await readdir(outdir)) {
    if (!/\.(?:woff2?|otf|ttf)$/i.test(fileName)) continue;
    const size = Bun.file(resolve(outdir, fileName)).size;
    if (size > MAX_FONT_BYTES) {
        throw new Error(`${fileName} 为 ${size} bytes，超过 ${MAX_FONT_BYTES} bytes 字体预算`);
    }
}

console.log(`Built ${outputCount} assets to ${outdir} with production React and Tailwind processing enabled.`);
