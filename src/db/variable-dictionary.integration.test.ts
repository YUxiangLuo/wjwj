import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";
import type { VariableDictionary } from "../domain/variables/types";

// 字典保存、冻结、换源与复制的真实数据库竞争回归。
const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;

let application: typeof import("./index");
let dictionaryService: typeof import("../teacher/topic/variable-dictionary-service");
let manageService: typeof import("../teacher/topic/manage-service");
let contentService: typeof import("../teacher/topic/content-service");
let variableSource: typeof import("../server/variable-source");
let raw: SQL;
const cleanup: Array<() => Promise<void>> = [];

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    [dictionaryService, manageService, contentService, variableSource] = await Promise.all([
        import("../teacher/topic/variable-dictionary-service"),
        import("../teacher/topic/manage-service"),
        import("../teacher/topic/content-service"),
        import("../server/variable-source"),
    ]);
});

afterEach(async () => {
    if (!required) return;
    for (const step of cleanup) await step().catch(() => undefined);
    cleanup.length = 0;
});
afterAll(async () => { if (required) { await application?.closeDatabase(); await raw?.close(); } });

const csv = "id,value,group\n1,10,A\n2,20,A\n3,30,B\n4,40,B\n5,50,B\n";

pgTest.each(["mean", "proportion"])("primary %s targets cannot declare observed values missing at save or publication", async (kind) => {
    const f = await fixture();
    const mapping = { ...f.mapping, studyContract: { ...f.mapping.studyContract,
        target: kind === "mean" ? { kind: "mean", field: "value" } : { kind: "proportion", field: "group", value: "A" },
    } };
    await application.db.update(schema.topic).set({ fieldMapping: mapping }).where(eq(schema.topic.id, f.topic.id));
    const source = await variableSource.readVariableSource(f.storagePath, mapping);
    const dictionary: VariableDictionary = f.dictionaryFrom("Value", source.source);
    if (kind === "mean") dictionary.variables[1]!.missing = [null, "10"];
    else {
        dictionary.variables[2]!.missing = [null, "A"];
        dictionary.variables[2]!.categories = [{ value: "B", label: "B" }];
    }
    const save = await dictionaryService.putTeacherVariableDictionary({ teacherId: f.teacher.id, topicId: f.topic.id,
        body: { source: source.source, observedRevision: 0, dictionary } });
    // A historical or restored dictionary must also be checked at publication.
    await application.db.update(schema.topic).set({ variableDictionary: dictionary, variableRevision: 0 }).where(eq(schema.topic.id, f.topic.id));
    const publish = await manageService.updateTeacherTopicBasics({ teacherId: f.teacher.id, topicId: f.topic.id, body: { status: 1 } });
    expect({ saveRejected: !save.ok, publishRejected: !publish.ok }).toEqual({ saveRejected: true, publishRejected: true });
    expect((await f.readTopic()).status).toBe(0);
});

async function fixture() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const storagePath = `/storage/test/dictionary-${suffix}.csv`;
    const absolutePath = `${process.cwd()}${storagePath}`;
    await Bun.write(absolutePath, csv);
    const mapping = {
        identifier: "id", numeric: ["value"], stratified: ["group"], others: [],
        studyContract: {
            version: 1 as const, researchQuestion: "总体中 value 的平均水平是多少？",
            targetPopulation: "全部单位", unitOfAnalysis: "一行记录", target: { kind: "mean" as const, field: "value" },
        },
    };
    const [semester] = await application.db.insert(schema.semester).values({ name: `dict-${suffix}` }).returning();
    const [teacher] = await application.db.insert(schema.teacher).values({ employeeId: `dt-${suffix}`, name: "字典教师", password: "unused" }).returning();
    const [cls] = await application.db.insert(schema.class_).values({ name: "字典班级", semesterId: semester!.id, teacherId: teacher!.id }).returning();
    const [topic] = await application.db.insert(schema.topic).values({
        teacherId: teacher!.id, name: "字典模板", status: 0, excelFilePath: storagePath, excelRowCount: 5,
        fieldMapping: mapping, variableDictionary: null, variableRevision: 0,
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
    }).returning();
    cleanup.push(
        async () => { await application.db.delete(schema.task).where(eq(schema.task.classId, cls!.id)); },
        async () => { await application.db.delete(schema.topic).where(eq(schema.topic.id, topic!.id)); },
        async () => { await application.db.delete(schema.topic).where(eq(schema.topic.name, `字典模板 (副本)`)); },
        async () => { await application.db.delete(schema.class_).where(eq(schema.class_.id, cls!.id)); },
        async () => { await application.db.delete(schema.teacher).where(eq(schema.teacher.id, teacher!.id)); },
        async () => { await application.db.delete(schema.semester).where(eq(schema.semester.id, semester!.id)); },
        async () => { await Bun.file(absolutePath).delete(); },
    );
    const readTopic = async () => (await application.db.select().from(schema.topic).where(eq(schema.topic.id, topic!.id)))[0]!;
    const source = async () => (await variableSource.readVariableSource(storagePath, mapping)).source;
    const put = (observedRevision: number, sourceValue: string, label = "Value") => dictionaryService.putTeacherVariableDictionary({
        teacherId: teacher!.id, topicId: topic!.id,
        body: { source: sourceValue, observedRevision, dictionary: dictionaryFrom(label, sourceValue, observedRevision) },
    });
    const dictionaryFrom = (label: string, sourceValue: string, revision = 0) => ({
        source: sourceValue,
        revision,
        variables: [
            { field: "id", label: "ID", unit: "", kind: "identifier" as const, categories: [], missing: [null] },
            { field: "value", label, unit: "分", kind: "continuous" as const, categories: [], missing: [null] },
            { field: "group", label: "组", unit: "", kind: "nominal" as const, categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }], missing: [null] },
        ],
    });
    return { semester: semester!, teacher: teacher!, cls: cls!, topic: topic!, storagePath, absolutePath , mapping, readTopic, source, put, dictionaryFrom };
}

pgTest("D02/D05 a real save validates the whole population, is a no-op when equivalent and bumps the revision otherwise", async () => {
    const f = await fixture();
    const sourceValue = await f.source();

    // 非法字典（空标签）被拒绝且不写库
    const invalid = await dictionaryService.putTeacherVariableDictionary({
        teacherId: f.teacher.id, topicId: f.topic.id,
        body: { source: sourceValue, observedRevision: 0, dictionary: { ...f.dictionaryFrom("Value", sourceValue, 0), variables: f.dictionaryFrom("Value", sourceValue, 0).variables.map(variable => variable.field === "value" ? { ...variable, label: "" } : variable) } },
    });
    expect(invalid).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect((await f.readTopic()).variableDictionary).toBeNull();
    expect((await f.readTopic()).variableRevision).toBe(0);

    // 修订号或来源不匹配：拒绝且不写库
    expect(await f.put(1, sourceValue)).toMatchObject({ ok: false, code: "VARIABLE_REVISION_CONFLICT" });
    expect(await dictionaryService.putTeacherVariableDictionary({
        teacherId: f.teacher.id, topicId: f.topic.id,
        body: { source: "stale-source", observedRevision: 0, dictionary: f.dictionaryFrom("Value", "stale-source", 0) },
    })).toMatchObject({ ok: false, code: "VARIABLE_SOURCE_CONFLICT" });
    expect((await f.readTopic()).variableRevision).toBe(0);

    // 首次确认：revision 0 → 1
    expect(await f.put(0, sourceValue)).toEqual({ ok: true, revision: 1 });
    // 等价保存不增加修订号
    expect(await f.put(1, sourceValue)).toEqual({ ok: true, revision: 1 });
    expect((await f.readTopic()).variableRevision).toBe(1);
    // 语义变化增加修订号并持久化
    expect(await f.put(1, sourceValue, "分数")).toEqual({ ok: true, revision: 2 });
    const stored = (await f.readTopic()).variableDictionary as { revision: number; variables: Array<{ field: string; label: string }> };
    expect(stored.revision).toBe(2);
    expect(stored.variables.find(variable => variable.field === "value")!.label).toBe("分数");
});

pgTest("D04 two concurrent saves with the same observed revision serialise (20 rounds)", async () => {
    const f = await fixture();
    const sourceValue = await f.source();
    expect(await f.put(0, sourceValue)).toEqual({ ok: true, revision: 1 });

    for (let round = 0; round < 20; round += 1) {
        const observedRevision = (await f.readTopic()).variableRevision;
        const settled = await Promise.allSettled([
            f.put(observedRevision, sourceValue, `左${round}`),
            f.put(observedRevision, sourceValue, `右${round}`),
        ]);
        const results = settled.map(item => item.status === "fulfilled" ? item.value : { ok: false as const, code: "THREW" });
        expect(results.filter(result => result.ok), `round ${round}`).toHaveLength(1);
        expect(results.filter(result => !result.ok).map(result => (result as { code: string }).code), `round ${round}`).toEqual(["VARIABLE_REVISION_CONFLICT"]);
        const topic = await f.readTopic();
        expect(topic.variableRevision, `round ${round}`).toBe(observedRevision + 1);
        const label = (topic.variableDictionary as { variables: Array<{ field: string; label: string }> }).variables.find(variable => variable.field === "value")!.label;
        expect([`左${round}`, `右${round}`], `round ${round}`).toContain(label);
    }
}, 30_000);

pgTest("D04 a freeze inside the lock makes the waiting dictionary save fail without touching the revision", async () => {
    const f = await fixture();
    const sourceValue = await f.source();
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holder = raw.begin(async tx => {
        await tx`SELECT id FROM topic WHERE id = ${f.topic.id} FOR UPDATE`;
        await tx`UPDATE topic SET status = 1 WHERE id = ${f.topic.id}`;
        acquired.resolve();
        await release.promise;
    });
    await acquired.promise;
    const pending = f.put(0, sourceValue);
    release.resolve();
    await holder;
    expect(await pending).toMatchObject({ ok: false, code: "TOPIC_LOCKED", status: 409 });
    const topic = await f.readTopic();
    expect(topic.status).toBe(1);
    expect(topic.variableRevision).toBe(0);
    expect(topic.variableDictionary).toBeNull();
}, 15_000);

pgTest("D04 an edit committed before publish is the dictionary the published template keeps", async () => {
    const f = await fixture();
    const sourceValue = await f.source();
    expect(await f.put(0, sourceValue, "发布前修订")).toEqual({ ok: true, revision: 1 });

    const published = await manageService.updateTeacherTopicBasics({ teacherId: f.teacher.id, topicId: f.topic.id, body: { status: 1 } });
    expect(published).toEqual({ ok: true });
    const topic = await f.readTopic();
    expect(topic.status).toBe(1);
    expect(topic.variableRevision).toBe(1);
    expect((topic.variableDictionary as { variables: Array<{ field: string; label: string }> }).variables.find(variable => variable.field === "value")!.label).toBe("发布前修订");
    // 发布后任何字典编辑都被冻结
    expect(await f.put(1, sourceValue, "发布后")).toMatchObject({ ok: false, code: "TOPIC_LOCKED" });
}, 15_000);

pgTest("D04 replacing the population bytes makes the old-source save fail and keeps the stored revision", async () => {
    const f = await fixture();
    const sourceValue = await f.source();
    expect(await f.put(0, sourceValue)).toEqual({ ok: true, revision: 1 });
    await Bun.write(f.absolutePath, csv.replace("5,50,B", "5,51,B"));
    expect(await f.put(1, sourceValue, "换源前")).toMatchObject({ ok: false, code: "VARIABLE_SOURCE_CONFLICT" });
    const topic = await f.readTopic();
    expect(topic.variableRevision).toBe(1);
    expect((topic.variableDictionary as { variables: Array<{ field: string; label: string }> }).variables.find(variable => variable.field === "value")!.label).toBe("Value");
});

pgTest("D05 copying a topic validates and detaches the dictionary from later edits", async () => {
    const f = await fixture();
    const sourceValue = await f.source();
    expect(await f.put(0, sourceValue, "原模板")).toEqual({ ok: true, revision: 1 });

    const copy = await contentService.copyTopicWithResources({ teacherId: f.teacher.id, topicId: f.topic.id });
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    cleanup.unshift(
        async () => { const row = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, copy.id)))[0]; if (row?.excelFilePath) await Bun.file(`${process.cwd()}${row.excelFilePath}`).delete(); },
        async () => { await application.db.delete(schema.topic).where(eq(schema.topic.id, copy.id)); },
    );
    const copied = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, copy.id)))[0]!;
    const original = await f.readTopic();
    expect(copied.variableDictionary).toEqual(original.variableDictionary);
    expect(copied.variableDictionary).not.toBe(original.variableDictionary);

    // 副本可独立编辑；原模板修订不影响副本
    const copiedSource = (await variableSource.readVariableSource(copied.excelFilePath!, copied.fieldMapping)).source;
    expect(await dictionaryService.putTeacherVariableDictionary({
        teacherId: f.teacher.id, topicId: copied.id,
        body: { source: copiedSource, observedRevision: 1, dictionary: f.dictionaryFrom("副本修订", copiedSource, 1) },
    })).toEqual({ ok: true, revision: 2 });
    expect((await f.readTopic()).variableRevision).toBe(1);
    expect((await application.db.select().from(schema.topic).where(eq(schema.topic.id, copy.id)))[0]!.variableRevision).toBe(2);
}, 20_000);
