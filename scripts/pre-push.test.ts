import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const project = resolve(import.meta.dir, "..");
const zero = "0".repeat(40);

async function fixture(run: (context: {
    root: string;
    remote: string;
    git: (...args: string[]) => Promise<string>;
    hook: (input: string) => ReturnType<typeof command>;
    push: (...refs: string[]) => ReturnType<typeof command>;
    reports: () => Promise<Array<{ commit: string; cwd: string }>>;
}) => Promise<void>) {
    const directory = await mkdtemp(join(tmpdir(), "wj-push-test-"));
    const root = join(directory, "repo");
    const remote = join(directory, "remote.git");
    const report = join(directory, "checks.jsonl");
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` };
    // The regression itself may run inside a real pre-push hook.
    const localVars = await command(["git", "rev-parse", "--local-env-vars"], project, env);
    for (const name of localVars.stdout.trim().split("\n")) delete env[name];
    delete env.TEST_DATABASE_URL;
    delete env.DATABASE_URL;
    async function git(...args: string[]) {
        const result = await command(["git", ...args], root, env);
        if (result.code !== 0) throw new Error(result.stderr);
        return result.stdout.trim();
    }
    try {
        await mkdir(root);
        await git("init", "-b", "main");
        await git("config", "user.name", "CI regression");
        await git("config", "user.email", "ci@example.invalid");
        await git("config", "commit.gpgsign", "false");
        await git("init", "--bare", remote);
        await git("remote", "add", "origin", remote);
        await Bun.write(join(root, ".githooks/pre-push"), Bun.file(join(project, ".githooks/pre-push")));
        const chmod = await command(["chmod", "+x", ".githooks/pre-push"], root, env);
        if (chmod.code !== 0) throw new Error(chmod.stderr);
        await Bun.write(join(root, "scripts/pre-push.ts"), Bun.file(join(project, "scripts/pre-push.ts")));
        await Bun.write(join(root, "scripts/local-ci.ts"), `
            import { mkdir } from "node:fs/promises";
            if (process.env.TEST_DATABASE_URL !== "postgresql://fixture/provision") throw Error("lost local .env");
            if (await Bun.file("untracked.txt").exists() || await Bun.file("node_modules/marker").exists()) throw Error("shared working files");
            if (process.env.DEMO_MODE !== "0" || process.env.BUILD_OUTDIR) throw Error("unsafe build environment");
            const head = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
            if (head.exitCode !== 0) throw Error("cannot resolve isolated HEAD");
            const file = Bun.file(${JSON.stringify(report)});
            await Bun.write(file, (await file.exists() ? await file.text() : "") + JSON.stringify({commit: head.stdout.toString().trim(), cwd: process.cwd()}) + "\\n");
            await mkdir("dist", {recursive:true});
            await Bun.write("dist/checked", "generated");
            process.exitCode = (await Bun.file("state.txt").text()) === "pass" ? 0 : 1;
        `);
        await Bun.write(join(root, ".gitignore"), "node_modules/\ndist/\n.env\nuntracked.txt\n");
        await Bun.write(join(root, ".env"), "TEST_DATABASE_URL=postgresql://fixture/provision\n");
        await Bun.write(join(root, "state.txt"), "pass");
        await mkdir(join(root, "node_modules/.bin"), { recursive: true });
        await symlink(process.execPath, join(root, "node_modules/.bin/bun"));
        await Bun.write(join(root, "node_modules/marker"), "local dependencies");
        await Bun.write(join(root, "untracked.txt"), "local file");
        await git("add", ".");
        await git("commit", "-m", "passing commit");
        await git("config", "core.hooksPath", ".githooks");
        await run({
            root, remote, git,
            hook: input => command([".githooks/pre-push"], root, env, input),
            push: (...refs) => command(["git", "push", "origin", ...refs], root, env),
            reports: async () => await Bun.file(report).exists()
                ? (await Bun.file(report).text()).trim().split("\n").map(line => JSON.parse(line)) : [],
        });
        expect((await git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(1);
        expect(await Bun.file(join(root, "dist/checked")).exists()).toBe(false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

async function command(args: string[], cwd: string, env: NodeJS.ProcessEnv, input?: string) {
    const child = Bun.spawn(args, {
        cwd, env, stdin: input === undefined ? "ignore" : new TextEncoder().encode(input), stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, code };
}

test("push validates the outgoing commit despite dirty files, and rejects a broken commit despite an uncommitted fix", async () => {
    await fixture(async ({ root, git, push, reports }) => {
        const good = await git("rev-parse", "HEAD");
        await Bun.write(join(root, "state.txt"), "fail");
        expect((await push("main")).code).toBe(0);
        expect((await reports()).map(row => row.commit)).toEqual([good]);
        expect(await Bun.file(join(root, "state.txt")).text()).toBe("fail");
        await git("add", "state.txt");
        await git("commit", "-m", "broken commit");
        const broken = await git("rev-parse", "HEAD");
        await Bun.write(join(root, "state.txt"), "pass");
        expect((await push("main")).code).not.toBe(0);
        expect((await git("ls-remote", "origin", "refs/heads/main")).split(/\s+/)[0]).toBe(good);
        expect((await reports()).map(row => row.commit)).toEqual([good, broken]);
        for (const row of await reports()) expect(await Bun.file(join(row.cwd, ".git")).exists()).toBe(false);
    });
});

test("multi-ref pushes validate each distinct commit, including annotated tags and branches other than HEAD", async () => {
    await fixture(async ({ root, git, push, reports }) => {
        const first = await git("rev-parse", "HEAD");
        await git("branch", "other");
        await git("-c", "tag.gpgSign=false", "tag", "-a", "v1", "-m", "first release");
        await Bun.write(join(root, "second.txt"), "second commit");
        await git("add", "second.txt");
        await git("commit", "-m", "another passing commit");
        const second = await git("rev-parse", "HEAD");
        expect((await push("main", "other", "v1")).code).toBe(0);
        expect((await reports()).map(row => row.commit).sort()).toEqual([first, second].sort());
        expect((await push("--delete", "other")).code).toBe(0);
        expect((await push("main")).code).toBe(0);
        expect(await reports()).toHaveLength(2);
    });
});

test("invalid push input or a tag pointing at a blob fails closed; deletion and empty input skip CI", async () => {
    await fixture(async ({ git, hook, reports }) => {
        const head = await git("rev-parse", "HEAD");
        expect((await hook("malformed\n")).code).not.toBe(0);
        const blob = await git("rev-parse", "HEAD:state.txt");
        expect((await hook(`refs/tags/blob ${blob} refs/tags/blob ${zero}\n`)).code).not.toBe(0);
        expect((await hook(`(delete) ${zero} refs/heads/old ${head}\n`)).code).toBe(0);
        expect((await hook("")).code).toBe(0);
        expect(await reports()).toHaveLength(0);
    });
});
