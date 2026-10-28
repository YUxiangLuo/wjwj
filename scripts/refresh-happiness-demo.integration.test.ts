import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { assertTestDatabaseIsMigrated } from "../src/db/test-database-guard";
import { databaseNameFromUrl } from "../src/db/destructive-confirmation";
import { DOGFOOD_NAMES, HAPPINESS_POPULATION_PATH } from "../src/db/seeds/dogfood-fixtures";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;

async function fixture() {
    const sql = new SQL(url!);
    await assertTestDatabaseIsMigrated(sql);
    const work = await mkdtemp(join(tmpdir(), "wj-refresh-test-"));
    const legacyPath = "/storage/topics/seed-population-youth-happiness.xlsx";
    const target = join(work, HAPPINESS_POPULATION_PATH);
    const legacy = join(work, legacyPath);
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(legacy, "preserved legacy population");
    const suffix = crypto.randomUUID().replaceAll("-", "");
    let teacherId: number | undefined;
    let semesterId: number | undefined;
    let classId: number | undefined;
    let studentId: number | undefined;
    let topicId: number | undefined;
    let taskId: number | undefined;
    const cleanup = async () => {
        try {
            if (studentId) await sql`DELETE FROM user_session WHERE user_type=3 AND user_id=${studentId}`;
            if (taskId) await sql`DELETE FROM task WHERE id=${taskId}`;
            if (studentId) await sql`DELETE FROM student WHERE id=${studentId}`;
            if (topicId) await sql`DELETE FROM topic WHERE id=${topicId}`;
            if (classId) await sql`DELETE FROM class WHERE id=${classId}`;
            if (semesterId) await sql`DELETE FROM semester WHERE id=${semesterId}`;
            if (teacherId) await sql`DELETE FROM teacher WHERE id=${teacherId}`;
        } finally { await sql.close(); await rm(work, { recursive: true, force: true }); }
    };
    try {
        // The maintenance CLI deliberately matches T001. Never borrow or modify
        // an existing teacher; this suite runs before demo seeding in test:db.
        teacherId = Number((await sql`INSERT INTO teacher(employee_id,name,password) VALUES('T001','Refresh fixture','unused') RETURNING id`)[0].id);
        semesterId = Number((await sql`INSERT INTO semester(name) VALUES(${suffix.slice(0, 20)}) RETURNING id`)[0].id);
        classId = Number((await sql`INSERT INTO class(name,teacher_id,semester_id) VALUES('Refresh fixture',${teacherId},${semesterId}) RETURNING id`)[0].id);
        studentId = Number((await sql`INSERT INTO student(student_id,name,password,class_id) VALUES(${suffix},'Refresh student','unused',${classId}) RETURNING id`)[0].id);
        topicId = Number((await sql`INSERT INTO topic(teacher_id,name,excel_file_path) VALUES(${teacherId},${DOGFOOD_NAMES.topicA},${legacyPath}) RETURNING id`)[0].id);
        taskId = Number((await sql`INSERT INTO task(topic_id,class_id) VALUES(${topicId},${classId}) RETURNING id`)[0].id);
        await sql`INSERT INTO experiment(student_id,task_id) VALUES(${studentId},${taskId})`;
        await sql`INSERT INTO user_session(session_token,user_type,user_id,expires_at) VALUES(${suffix},3,${studentId},now()+interval '1 day')`;
        const snapshot = async () => ({
            topic: (await sql`SELECT * FROM topic WHERE id=${topicId}`)[0],
            experiments: await sql`SELECT * FROM experiment WHERE task_id=${taskId}`,
            sessions: await sql`SELECT * FROM user_session WHERE session_token=${suffix}`,
            legacy: await Bun.file(legacy).text(),
        });
        const run = async (limitFileSize = false) => {
            const command = [process.execPath, join(import.meta.dir, "refresh-happiness-demo.ts"), "--apply"];
            const child = Bun.spawn(limitFileSize
                ? ["bash", "-c", 'ulimit -c 0; ulimit -f 16; exec "$@"', "refresh-test", ...command]
                : command, {
                cwd: work,
                env: { ...process.env, DATABASE_URL: url!, DEMO_MODE: "1", CONFIRM_DATABASE_NAME: databaseNameFromUrl(url!)! },
                stdout: "pipe", stderr: "pipe",
            });
            const [stdout, stderr, exit] = await Promise.all([
                new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
            ]);
            return { stdout, stderr, exit };
        };
        return { sql, topicId, target, work, snapshot, run, cleanup, suffix };
    } catch (cause) { await cleanup(); throw cause; }
}

pgTest("happiness refresh recovers from a partial file write without occupying its final path", async () => {
    const f = await fixture();
    try {
        const before = await f.snapshot();
        const failed = await f.run(true);
        expect(failed.exit).not.toBe(0);
        expect(failed.stderr).toContain("EFBIG");
        expect(failed.stdout).not.toContain('"updated":true');
        expect(await f.snapshot()).toEqual(before);
        expect(await readdir(dirname(f.target))).toEqual(["seed-population-youth-happiness.xlsx"]);

        const retry = await f.run();
        expect(retry.exit).toBe(0);
        expect(retry.stdout).toContain('"updated":true');
        expect(Bun.file(f.target).size).toBeGreaterThan(16_384);
        const after = await f.snapshot();
        expect(after.topic.excel_file_path).toBe(HAPPINESS_POPULATION_PATH);
        expect(after.experiments).toHaveLength(0);
        expect(after.sessions).toHaveLength(0);
        expect(after.legacy).toBe(before.legacy);
    } finally { await f.cleanup(); }
});

pgTest("happiness refresh reports success only after commit and reuses a complete file after rollback", async () => {
    const f = await fixture();
    const trigger = `refresh_failure_${f.suffix}`;
    try {
        const before = await f.snapshot();
        await f.sql.unsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected refresh commit failure'; END; $$`);
        await f.sql.unsafe(`CREATE CONSTRAINT TRIGGER ${trigger} AFTER UPDATE ON topic DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id=${f.topicId}) EXECUTE FUNCTION ${trigger}()`);
        const failed = await f.run();
        expect(failed.exit).toBe(1);
        expect(failed.stderr).toContain("injected refresh commit failure");
        expect(failed.stdout).not.toContain('"updated":true');
        expect(await f.snapshot()).toEqual(before);
        const completeBytes = await Bun.file(f.target).arrayBuffer();
        expect(completeBytes.byteLength).toBeGreaterThan(16_384);
        await f.sql.unsafe(`DROP TRIGGER ${trigger} ON topic`);

        const retry = await f.run();
        expect(retry.exit).toBe(0);
        expect(retry.stdout).toContain('"updated":true');
        expect(await Bun.file(f.target).arrayBuffer()).toEqual(completeBytes);
        expect((await f.snapshot()).experiments).toHaveLength(0);
    } finally {
        await f.sql.unsafe(`DROP TRIGGER IF EXISTS ${trigger} ON topic`);
        await f.sql.unsafe(`DROP FUNCTION IF EXISTS ${trigger}()`);
        await f.cleanup();
    }
});

pgTest("happiness refresh refuses an existing different version without changing data or files", async () => {
    const f = await fixture();
    try {
        await Bun.write(f.target, "existing different workbook");
        const before = await f.snapshot();
        const failed = await f.run();
        expect(failed.exit).toBe(1);
        expect(failed.stderr).toContain("目标版本文件已存在且内容不同");
        expect(failed.stdout).not.toContain('"updated":true');
        expect(await f.snapshot()).toEqual(before);
        expect(await Bun.file(f.target).text()).toBe("existing different workbook");
        expect((await readdir(dirname(f.target))).sort()).toEqual([
            basename(HAPPINESS_POPULATION_PATH), "seed-population-youth-happiness.xlsx",
        ]);
    } finally { await f.cleanup(); }
});
