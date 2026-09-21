import { SQL } from "bun";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
