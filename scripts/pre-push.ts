import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

async function main() {
    // Git supplies the exact objects being pushed, which need not be HEAD.
    const input = await Bun.stdin.text();
    const objects = new Set<string>();
    for (const line of input.split("\n")) {
        if (!line.trim()) continue;
        const fields = line.trim().split(/\s+/);
        const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
        if (fields.length !== 4 || !oid.test(fields[1]!) || !oid.test(fields[3]!)) {
            throw new Error("无法解析 Git pre-push 输入；拒绝推送。请用 bun run ci:local 检查工作区。");
        }
        if (!/^0+$/.test(fields[1]!)) objects.add(fields[1]!);
    }
    if (!objects.size) return; // Nothing new to validate for no-op/deletion pushes.

    const root = process.cwd();
    const environment = { ...process.env };
    async function git(...args: string[]) {
        const child = Bun.spawn(["git", ...args], {
            cwd: root, env: environment, stdin: "ignore", stdout: "pipe", stderr: "pipe",
        });
        const [stdout, stderr, code] = await Promise.all([
            new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
        ]);
        if (code !== 0) throw new Error(`git ${args[0]} 失败：${stderr.trim()}`);
        return stdout.trim();
    }

    // Git's hook environment must not redirect commands in the temporary worktree
    // back to the original checkout/index (see githooks' foreign-worktree rules).
    for (const name of (await git("rev-parse", "--local-env-vars")).split("\n")) {
        delete environment[name];
    }
    environment.PATH = `${dirname(process.execPath)}:${environment.PATH ?? ""}`;
    environment.NODE_ENV = "development"; // CI needs devDependencies even from a production shell.
    environment.DEMO_MODE = "0";
    environment.REQUIRE_TEST_DATABASE = "0"; // test:db enables the separate real-DB suite itself.
    delete environment.BUILD_OUTDIR;

    const commits = new Set<string>();
    for (const object of objects) {
        // Peel annotated tags; reject objects without a commit rather than silently passing.
        commits.add(await git("rev-parse", "--verify", `${object}^{commit}`));
    }
    for (const commit of commits) {
        const directory = await mkdtemp(join(tmpdir(), "wj-pre-push-"));
        const checkout = join(directory, "checkout");
        let added = false;
        try {
            await git("-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", checkout, commit);
            added = true;
            console.log(`\n推送门禁：验证提交 ${commit}（临时 worktree）`);
            // Run this commit's gate with the hook's pinned Bun. local-ci installs
            // its own locked dependencies and provisions a disposable database.
            const child = Bun.spawn([process.execPath, "scripts/local-ci.ts"], {
                cwd: checkout, env: environment, stdin: "ignore", stdout: "inherit", stderr: "inherit",
            });
            if (await child.exited !== 0) throw new Error(`提交 ${commit} 未通过 CI，拒绝推送。`);
        } finally {
            try {
                if (added) await git("worktree", "remove", "--force", checkout);
            } finally {
                await rm(directory, { recursive: true, force: true });
            }
        }
    }
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
