interface AuditAdvisory {
    id: number;
    url: string;
    title: string;
    severity: string;
}

type AuditReport = Record<string, AuditAdvisory[]>;

const ACCEPTED_RESIDUALS: Record<number, { packageName: string; rationale: string }> = {
    1102341: {
        packageName: "esbuild",
        rationale: "GHSA-67mh-4wv8-2f99 is confined to the drizzle-kit development dependency; the app uses Bun.serve and never runs esbuild's development server.",
    },
    1120680: {
        packageName: "esbuild",
        rationale: "GHSA-g7r4-m6w7-qqqr affects esbuild's Windows development server; this Linux/Bun app does not invoke that server.",
    },
};

export function classifyAuditReport(report: AuditReport) {
    const accepted: Array<AuditAdvisory & { packageName: string; rationale: string }> = [];
    const unexpected: Array<AuditAdvisory & { packageName: string }> = [];

    for (const [packageName, advisories] of Object.entries(report)) {
        for (const advisory of advisories) {
            const acceptance = ACCEPTED_RESIDUALS[advisory.id];
            if (acceptance?.packageName === packageName) {
                accepted.push({ ...advisory, packageName, rationale: acceptance.rationale });
            } else {
                unexpected.push({ ...advisory, packageName });
            }
        }
    }

    return { accepted, unexpected };
}

async function main() {
    const audit = Bun.spawn(["bun", "audit", "--json"], {
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(audit.stdout).text(),
        new Response(audit.stderr).text(),
        audit.exited,
    ]);

    let report: AuditReport;
    try {
        report = JSON.parse(stdout.trim() || "{}") as AuditReport;
    } catch {
        console.error("Could not parse `bun audit --json` output.");
        if (stderr.trim()) console.error(stderr.trim());
        process.exitCode = 1;
        return;
    }

    const { accepted, unexpected } = classifyAuditReport(report);
    if (unexpected.length > 0) {
        console.error(`Dependency audit failed: ${unexpected.length} unaccepted advisory/advisories.`);
        for (const item of unexpected) {
            console.error(`- ${item.packageName}: ${item.id} ${item.severity} — ${item.title} (${item.url})`);
        }
        process.exitCode = 1;
        return;
    }

    if (accepted.length > 0) {
        console.log(`Dependency audit passed with ${accepted.length} documented non-applicable residual advisory/advisories.`);
        for (const item of accepted) {
            console.log(`- ${item.packageName}: ${item.id} — ${item.rationale}`);
        }
    } else if (exitCode === 0) {
        console.log("Dependency audit passed with no advisories.");
    } else {
        console.error("`bun audit` failed without a parseable advisory.");
        if (stderr.trim()) console.error(stderr.trim());
        process.exitCode = 1;
    }
}

if (import.meta.main) {
    await main();
}
