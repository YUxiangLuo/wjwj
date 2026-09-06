import { AnalysisService } from "../src/student/experiment/analysis-service";
import { runAnalysisJob, type AnalysisJob } from "../src/student/experiment/analysis-job";
import { compactSamplingResults } from "../src/student/experiment/sampling-storage";
import { createSeededRandom, performPPSSampling } from "../src/student/sampling";

// The load generator must run in a separate process: a same-thread client would
// stop scheduling its probes while the baseline blocks and underreport latency.
async function probe(baseUrl: string) {
    const latency: number[] = [];
    const probes: Promise<void>[] = [];
    const ping = () => {
        const start = performance.now();
        probes.push(fetch(`${baseUrl}/ping`).then(async response => {
            await response.text();
            latency.push(performance.now() - start);
        }));
    };
    await fetch(`${baseUrl}/ping`);
    const timer = setInterval(ping, 50);
    const started = performance.now();
    try {
        const results = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
            const response = await fetch(`${baseUrl}/analysis?index=${index}`);
            if (!response.ok) throw new Error(`Analysis returned ${response.status}`);
            await response.json();
        }));
        clearInterval(timer);
        await Promise.all(probes);
        latency.sort((a, b) => a - b);
        return {
            requests: results.length,
            elapsedMs: Math.round(performance.now() - started),
            pingCount: latency.length,
            pingP95Ms: Math.round(latency[Math.max(0, Math.ceil(latency.length * 0.95) - 1)] ?? 0),
            pingMaxMs: Math.round(latency.at(-1) ?? 0),
        };
    } finally { clearInterval(timer); }
}

if (Bun.argv[2] === "--client") {
    console.log(JSON.stringify(await probe(Bun.argv[3]!)));
} else {
    const N = 100_000;
    const population = Array.from({ length: N }, (_, index) => ({ size: 1 + index % 101, score: index % 97 }));
    const populationPath = `/storage/benchmark-analysis-${crypto.randomUUID()}.csv`;
    const file = Bun.file(`${process.cwd()}${populationPath}`);
    await Bun.write(file, `size,score\n${population.map(row => `${row.size},${row.score}`).join("\n")}\n`);
    const jobs: AnalysisJob[] = Array.from({ length: 4 }, (_, index) => {
        const sampleCount = 10_000 + index * 100;
        return {
            populationPath,
            fieldMapping: { numeric: ["size", "score"] },
            samplingResults: compactSamplingResults({ pps: {
                ...performPPSSampling(population, "size", sampleCount, createSeededRandom(index)),
                completed: true, sampleCount, sizeField: "size",
            } }),
            samplePlan: { confidenceLevel: "95", marginOfError: 5, finalSampleSize: sampleCount },
        };
    });
    const service = new AnalysisService();
    try {
        for (const mode of ["main-thread", "worker-cold", "worker-warm"] as const) {
            const server = Bun.serve({
                hostname: "127.0.0.1", port: 0,
                routes: {
                    "/ping": () => new Response("ok"),
                    "/analysis": async req => {
                        const job = jobs[Number(new URL(req.url).searchParams.get("index"))]!;
                        if (mode !== "main-thread") return Response.json(await service.run(job));
                        const result = await runAnalysisJob(job);
                        if (!result.ok) throw new Error(result.message);
                        return Response.json(result.data);
                    },
                },
            });
            try {
                const child = Bun.spawn([process.execPath, import.meta.path, "--client", String(server.url)], { stdout: "pipe", stderr: "pipe" });
                const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
                if (code !== 0) throw new Error(errors);
                console.log(JSON.stringify({ mode, populationSize: N, sampleSizes: [10000, 10100, 10200, 10300], ...JSON.parse(output) }));
            } finally { await server.stop(true); }
        }
    } finally {
        service.close();
        await file.delete();
    }
}
