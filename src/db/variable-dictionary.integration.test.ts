import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;
const repo = process.cwd();
const workdir = `/tmp/wjwj-dictionary-pg-${crypto.randomUUID()}`;
let app: typeof import("./index");
let service: typeof import("../teacher/topic/variable-dictionary-service");
let manage: typeof import("../teacher/topic/manage-service");
let raw: SQL;
const teacherIds: number[] = [];

beforeAll(async () => {
    if (!required) return;
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    process.env.DATABASE_URL = url!;
    // Bind the real storage module to a disposable directory, never business uploads.
    await Bun.write(`${workdir}/storage/source.csv`, "id,value\n001,10\n002,20\n");
    process.chdir(workdir);
    app = await import("./index");
    service = await import("../teacher/topic/variable-dictionary-service");
    manage = await import("../teacher/topic/manage-service");
});
afterEach(async () => {
    if (!required || !app) return;
    if (teacherIds.length) {
        await app.db.delete(schema.topic).where(inArray(schema.topic.teacherId, teacherIds));
        await app.db.delete(schema.teacher).where(inArray(schema.teacher.id, teacherIds));
    }
    teacherIds.length = 0;
});
afterAll(async () => {
    if (!required) return;
    process.chdir(repo);
    await app?.closeDatabase(); await raw?.close();
    if (!workdir.startsWith("/tmp/wjwj-dictionary-pg-")) throw new Error("Unsafe cleanup path");
    await Bun.$`/bin/rm -rf -- ${workdir}`.quiet();
});
async function fixture() {
    const [teacher] = await app.db.insert(schema.teacher).values({ employeeId: crypto.randomUUID(), name: "字典测试教师", password: "not-used" }).returning();
    teacherIds.push(teacher!.id);
    const [topic] = await app.db.insert(schema.topic).values({
        teacherId: teacher!.id, name: "字典测试总体", excelFilePath: "/storage/source.csv", excelRowCount: 2,
        fieldMapping: { identifier: "id", numeric: ["value"], analysisTarget: { kind: "mean", field: "value" } },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        weightConfig: { questionnaire: 20, process: 40, report: 40 },
    }).returning();
    return { teacherId: teacher!.id, topicId: topic!.id, original: topic! };
}
async function waitForLock(fragment: string) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
        const rows = await raw`select query from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`;
        if (rows.some((r: { query: string }) => r.query.includes(fragment))) return;
        await Bun.sleep(10);
    }
    throw new Error(`Expected real PostgreSQL lock wait for ${fragment}`);
}

pgTest("dictionary migration preserves nullable legacy rows and enforces a confirmed JSONB envelope", async () => {
    const f = await fixture();
    expect(f.original.variableDictionary).toBeNull();
    const result = await service.accessTeacherVariableDictionary(f);
    expect(result.ok).toBe(true);
    const [after] = await app.db.select().from(schema.topic).where(eq(schema.topic.id, f.topicId));
    expect(after).toEqual(f.original);
    for (const value of [[], {}, { schemaVersion: 1, revision: 0, variables: [] }, { schemaVersion: 2, revision: 1, variables: [] }]) {
        // Bun SQL queries are lazy thenables; explicitly await execution rather
        // than passing an unstarted query to the test runner's Promise matcher.
        let rejected = false;
        try { await raw`update topic set variable_dictionary=${value}::jsonb where id=${f.topicId}`; }
        catch { rejected = true; }
        expect(rejected).toBe(true);
    }
    if (!result.ok) return;
    const saved = await service.accessTeacherVariableDictionary({ ...f, input: result.dictionary });
    expect(saved.ok).toBe(true);
    const [row] = await app.db.select().from(schema.topic).where(eq(schema.topic.id, f.topicId));
    expect(row?.variableDictionary).toMatchObject({ schemaVersion: 1, revision: 1 });
    expect(row?.fieldMapping).toEqual(f.original.fieldMapping);
    expect(await Bun.file(`${workdir}/storage/source.csv`).text()).toBe("id,value\n001,10\n002,20\n");
});

pgTest("concurrent dictionary confirmations cannot overwrite the first saved revision", async () => {
    const f = await fixture();
    const initial = await service.accessTeacherVariableDictionary(f);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const results = await Promise.all([1, 2].map(i => {
        const dictionary = structuredClone(initial.dictionary); dictionary.variables[1]!.label = `版本${i}`;
        return service.accessTeacherVariableDictionary({ ...f, input: dictionary });
    }));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok)).toMatchObject([{ code: "VERSION_CONFLICT", status: 409 }]);
    const saved = await service.accessTeacherVariableDictionary(f);
    expect(saved.ok && saved.dictionary.revision).toBe(1);
    expect(saved.ok && saved.dictionary.variables[1]?.label).toBe(results.find(r => r.ok)!.dictionary.variables[1]?.label);
});

pgTest("publication wins a controlled race and a waiting dictionary writer rechecks the frozen state", async () => {
    const f = await fixture();
    const initial = await service.accessTeacherVariableDictionary(f);
    if (!initial.ok) throw new Error(initial.message);
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = raw.begin(async tx => {
        await tx`select id from topic where id=${f.topicId} for update`;
        acquired.resolve(); await release.promise;
    });
    await acquired.promise;
    let publishing: ReturnType<typeof manage.updateTeacherTopicBasics> | undefined;
    let saving: ReturnType<typeof service.accessTeacherVariableDictionary> | undefined;
    try {
        publishing = manage.updateTeacherTopicBasics({ ...f, body: { status: 1 } });
        await waitForLock('update "topic"');
        saving = service.accessTeacherVariableDictionary({ ...f, input: initial.dictionary });
        await waitForLock("pg_advisory_xact_lock");
    } finally {
        release.resolve(); await blocker;
    }
    expect(await publishing).toMatchObject({ ok: true });
    expect(await saving).toMatchObject({ ok: false, code: "FORBIDDEN", status: 403 });
    const [row] = await app.db.select().from(schema.topic).where(eq(schema.topic.id, f.topicId));
    expect(row).toMatchObject({ status: 1, variableDictionary: null });
});

pgTest("restoring identical field roles cannot revive a stale dictionary write (ABA)", async () => {
    const f = await fixture();
    const initial = await service.accessTeacherVariableDictionary(f);
    if (!initial.ok) throw new Error(initial.message);
    const first = await service.accessTeacherVariableDictionary({ ...f, input: initial.dictionary });
    if (!first.ok) throw new Error(first.message);
    const alternate = { identifier: "id", numeric: [], others: ["value"], analysisTarget: { kind: "proportion", field: "value", value: "10" } };
    for (const mapping of [alternate, f.original.fieldMapping as typeof alternate]) {
        expect(await manage.updateTopicFieldMapping({ ...f, fieldMapping: mapping })).toMatchObject({ ok: true });
    }
    const restored = await service.accessTeacherVariableDictionary(f);
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.confirmed).toBe(false);
    expect(restored.dictionary.datasetRevision).toBe(first.dictionary.datasetRevision);
    expect(restored.dictionary.revision).toBeGreaterThan(first.dictionary.revision);
    restored.dictionary.variables[1]!.label = "重新确认的新解释";
    const saved = await service.accessTeacherVariableDictionary({ ...f, input: restored.dictionary });
    if (!saved.ok) throw new Error(saved.message);
    expect(await service.accessTeacherVariableDictionary({ ...f, input: first.dictionary }))
        .toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
    const final = await service.accessTeacherVariableDictionary(f);
    expect(final.ok && final.dictionary.variables[1]?.label).toBe("重新确认的新解释");
});
