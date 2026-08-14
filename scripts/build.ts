import tailwind from "bun-plugin-tailwind";
import { rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse, relative, resolve } from "node:path";
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

// Building the HTML entrypoints separately lets identical minified Tailwind
// chunks share their content hash without Bun treating the shared path as an
// intra-build collision.
for (const entrypoint of entrypoints) {
    const result = await Bun.build({
        entrypoints: [entrypoint],
        outdir,
        plugins: [tailwind],
        target: "browser",
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

console.log(`Built ${outputCount} assets to ${outdir} with production React and Tailwind processing enabled.`);
