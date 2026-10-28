import { SQL } from "bun";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";

const root = resolve(import.meta.dir, "..");
const packageJson = await Bun.file(join(root, "package.json")).json() as { engines?: { bun?: string } };
const expectedBun = packageJson.engines?.bun;
if (expectedBun && Bun.version !== expectedBun) {
    throw new Error(`本地 CI 需要 Bun ${expectedBun}，当前为 ${Bun.version}。`);
}

const provisionUrl = process.env.TEST_DATABASE_URL?.trim();
if (!provisionUrl) {
    throw new Error("TEST_DATABASE_URL 是必填项；该连接的角色必须能创建和删除一次性测试数据库。基准库本身不会被写入。");
}

const full = process.argv.includes("--full");
const databaseName = `wj_local_ci_${crypto.randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(provisionUrl);
databaseUrl.pathname = `/${databaseName}`;
const workdir = await mkdtemp(join(tmpdir(), "wj-local-ci-"));
const admin = new SQL(provisionUrl);
let databaseCreated = false;

async function command(label: string, args: string[], cwd: string, env: Record<string, string | undefined>) {
    console.log(`\n=== ${label} ===`);
    const child = Bun.spawn(args, {
        cwd,
        env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`${label} 失败（退出码 ${exitCode}）`);
}

async function verifyStoredMappingGuard(env: Record<string, string | undefined>) {
    // This connection points only at the disposable database created above.
    // Exercise the actual checker against committed drift, then restore it even
    // when the assertion fails. A fixture-only hash test would miss this bug.
    const fixtureDatabase = new SQL(String(databaseUrl));
    try {
        const rows = await fixtureDatabase`SELECT id, field_mapping FROM topic WHERE name=${DOGFOOD_NAMES.topicA}`;
        if (rows.length !== 1) throw new Error("映射校验回归缺少唯一幸福感课题");
        const row = rows[0]!;
        const original = row.field_mapping;
        const drifted = structuredClone(original);
        drifted.others = drifted.others.filter((field: string) => field !== "居住方式");
        drifted.stratified.push("居住方式");
        try {
            await fixtureDatabase`UPDATE topic SET field_mapping=${JSON.stringify(drifted)}::text::jsonb WHERE id=${row.id}`;
            const child = Bun.spawn([process.execPath, join(root, "src/db/seeds/check-default.ts")], {
                cwd: workdir, env, stdout: "pipe", stderr: "pipe",
            });
            const [stdout, stderr, code] = await Promise.all([
                new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
            ]);
            if (code === 0 || !`${stdout}\n${stderr}`.includes("变量字典的数据来源不匹配")) {
                throw new Error(`演示数据校验未正确拦截数据库映射漂移：${stdout}\n${stderr}`);
            }
            console.log("PASS seed checker rejects a stale dictionary after stored field roles change");
        } finally {
            await fixtureDatabase`UPDATE topic SET field_mapping=${JSON.stringify(original)}::text::jsonb WHERE id=${row.id}`;
        }
    } finally {
        await fixtureDatabase.close();
    }
}

try {
    await command("锁定依赖", [process.execPath, "install", "--frozen-lockfile"], root, process.env);

    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await mkdir(join(workdir, "storage"), { recursive: true });
    for (const name of [
        "bunfig.toml",
        "drizzle",
        "node_modules",
        "package.json",
        "public",
        "scripts",
        "src",
        "styles",
        "tsconfig.json",
    ]) {
        await symlink(join(root, name), join(workdir, name));
    }

    const databaseEnvironment = {
        ...process.env,
        DATABASE_URL: String(databaseUrl),
        TEST_DATABASE_URL: String(databaseUrl),
    };
    await command("迁移一次性数据库", [process.execPath, "run", "db:migrate"], workdir, databaseEnvironment);
    await command("类型、样式、文档、单测、构建与依赖门禁", [process.execPath, "run", "verify"], root, databaseEnvironment);
    await command("PostgreSQL 集成测试", [process.execPath, "run", "test:db"], workdir, databaseEnvironment);
    await command("演示数据初始化", [process.execPath, "run", "db:seed:demo"], workdir, databaseEnvironment);
    await command("演示数据校验", [process.execPath, "run", "db:seed:check"], workdir, databaseEnvironment);
    await verifyStoredMappingGuard(databaseEnvironment);
    await command("还原后的演示数据校验", [process.execPath, "run", "db:seed:check"], workdir, databaseEnvironment);

    if (full) {
        await command("随机顺序单元测试", [process.execPath, "run", "test:unit:random"], root, databaseEnvironment);
        await command("浏览器教学闭环", [process.execPath, "run", "test:teaching"], root, {
            ...process.env,
            TEST_DATABASE_URL: provisionUrl,
        });
    }

    console.log(`\n本地 CI 通过（${full ? "完整门禁" : "推送门禁"}）。`);
} finally {
    try {
        if (databaseCreated) await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } finally {
        try {
            await admin.close();
        } finally {
            await rm(workdir, { recursive: true, force: true });
        }
    }
}
