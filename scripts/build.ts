import tailwind from "bun-plugin-tailwind";
import { rm, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { countHardcodedPaletteClasses } from "./check-styles";
import {
    PREFILL_ADMIN_PASSWORD,
    PREFILL_ADMIN_USERNAME,
    PREFILL_STUDENT_ID,
    PREFILL_STUDENT_PASSWORD,
    PREFILL_TEACHER_ID,
    PREFILL_TEACHER_PASSWORD,
} from "../src/lib/prefill-credentials";

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

// DEMO_MODE=1 produces a demo build: the three login pages pre-fill the seeded
// demo credentials. Normal production builds must inline "0" so the prefill
// stays disabled at runtime.
const demoMode = process.env.DEMO_MODE === "1";
if (demoMode) {
    console.warn("⚠️  DEMO_MODE=1：演示构建会自动填入各端演示账号和密码，仅限演示环境，切勿用于正式教学部署。");
}

const prefillCredentials = {
    PREFILL_STUDENT_ID,
    PREFILL_STUDENT_PASSWORD,
    PREFILL_TEACHER_ID,
    PREFILL_TEACHER_PASSWORD,
    PREFILL_ADMIN_USERNAME,
    PREFILL_ADMIN_PASSWORD,
};
const prefillCredentialsPlugin: Bun.BunPlugin = {
    name: "production-prefill-credentials",
    target: "browser",
    setup(builder) {
        builder.onLoad({ filter: /prefill-credentials\.ts$/ }, () => ({
            loader: "ts",
            contents: Object.entries(prefillCredentials)
                .map(([name, value]) => `export const ${name} = ${JSON.stringify(demoMode ? value : "")};`)
                .join("\n"),
        }));
    },
};

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
        plugins: [tailwind, prefillCredentialsPlugin],
        target: "browser",
        splitting: true,
        publicPath: "/",
        define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
            // Production must never skip the first-login password gates, even
            // when a stale development environment exports DEV_AUTH_MODE=1.
            "process.env.DEV_AUTH_MODE": JSON.stringify("0"),
            "process.env.DEMO_MODE": JSON.stringify(demoMode ? "1" : "0"),
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

if (!demoMode) {
    const forbiddenPasswords = [
        PREFILL_STUDENT_PASSWORD,
        PREFILL_TEACHER_PASSWORD,
        PREFILL_ADMIN_PASSWORD,
    ];
    for (const fileName of await readdir(outdir)) {
        if (!fileName.endsWith(".js")) continue;
        const source = await Bun.file(resolve(outdir, fileName)).text();
        const leaked = forbiddenPasswords.find((password) => source.includes(password));
        if (leaked) throw new Error(`普通生产构建包含演示密码：${fileName}`);
    }
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
if (demoMode) {
    console.warn("⚠️  演示构建完成：登录页已预填演示账号（S010 / T001 / admin），请勿对外公开部署。");
}
