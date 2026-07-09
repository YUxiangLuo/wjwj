import tailwind from "bun-plugin-tailwind";

const outdir = process.env.BUILD_OUTDIR ?? "dist";
const entrypoints = [
    "src/admin/admin.html",
    "src/teacher/teacher.html",
    "src/student/student.html",
];

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
        define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
        },
        minify: true,
    });

    for (const log of result.logs) console.warn(log);
    if (!result.success) process.exit(1);
    outputCount += result.outputs.length;
}

console.log(`Built ${outputCount} assets to ${outdir} with production React and Tailwind processing enabled.`);
