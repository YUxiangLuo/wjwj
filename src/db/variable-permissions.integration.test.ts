import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";

// 使用真实 Cookie 和路由覆盖权限与输入攻击面。
const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;

let application: typeof import("./index");
let dictionaryService: typeof import("../teacher/topic/variable-dictionary-service");
let variableSource: typeof import("../server/variable-source");
let topicVariableRoutes: typeof import("../teacher/routes/variables").topicVariableRoutes;
let savedAnalysisRoutes: typeof import("../student/routes/variables").savedAnalysisRoutes;
let submissionByTaskRoutes: typeof import("../student/routes/submissions").submissionByTaskRoutes;
let gradingDetailRoutes: typeof import("../teacher/routes/grading").gradingDetailRoutes;
let withTeacherAuth: typeof import("../teacher/routes/auth").withTeacherAuth;
let raw: SQL;
const ids = { students: [] as number[], teachers: [] as number[], classes: [] as number[], topics: [] as number[], semesters: [] as number[] };
const files: string[] = [];

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    [dictionaryService, variableSource, { topicVariableRoutes }, { savedAnalysisRoutes }, { submissionByTaskRoutes }, { gradingDetailRoutes }, { withTeacherAuth }] = await Promise.all([
        import("../teacher/topic/variable-dictionary-service"),
        import("../server/variable-source"),
        import("../teacher/routes/variables"),
        import("../student/routes/variables"),
        import("../student/routes/submissions"),
        import("../teacher/routes/grading"),
        import("../teacher/routes/auth"),
    ]);
});

afterEach(async () => {
    if (!required) return;
    const { db } = application;
    if (ids.students.length) await db.delete(schema.student).where(inArray(schema.student.id, ids.students)).catch(() => undefined);
    if (ids.topics.length) await db.delete(schema.task).where(inArray(schema.task.topicId, ids.topics)).catch(() => undefined);
    if (ids.topics.length) await db.delete(schema.topic).where(inArray(schema.topic.id, ids.topics)).catch(() => undefined);
    if (ids.classes.length) await db.delete(schema.class_).where(inArray(schema.class_.id, ids.classes)).catch(() => undefined);
    if (ids.teachers.length) await db.delete(schema.teacher).where(inArray(schema.teacher.id, ids.teachers)).catch(() => undefined);
    if (ids.semesters.length) await db.delete(schema.semester).where(inArray(schema.semester.id, ids.semesters)).catch(() => undefined);
    for (const key of Object.keys(ids) as Array<keyof typeof ids>) ids[key].length = 0;
    for (const file of files.splice(0)) await Bun.file(file).delete().catch(() => undefined);
});
afterAll(async () => { if (required) { await application?.closeDatabase(); await raw?.close(); } });

function request(method: string, params: Record<string, string>, options: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const req = new Request("http://localhost", {
        method,
        headers: { "Content-Type": "application/json", ...(options.cookie ? { cookie: options.cookie } : {}), ...options.headers },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    (req as Request & { params: Record<string, string> }).params = params;
    return req;
}
async function session(userType: number, userId: number) {
    const token = crypto.randomUUID();
    await application.db.insert(schema.userSession).values({ userType, userId, sessionToken: token, expiresAt: new Date(Date.now() + 60_000) });
    return token;
}
const status = async (response: Response) => ({ status: response.status, body: await response.json() as { success: boolean; error?: { code: string } } });

async function fixture() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const storagePath = `/storage/test/permissions-${suffix}.csv`;
    await Bun.write(`${process.cwd()}${storagePath}`, "id,value,group\n1,10,A\n2,20,A\n3,30,B\n");
    files.push(`${process.cwd()}${storagePath}`);
    const mapping = { identifier: "id", numeric: ["value"], stratified: ["group"], others: [] };
    const [semester] = await application.db.insert(schema.semester).values({ name: `perm-${suffix}` }).returning();
    ids.semesters.push(semester!.id);
    const teachers = await application.db.insert(schema.teacher).values([0, 1].map(index => ({ employeeId: `pt-${suffix}-${index}`, name: `权限教师${index}`, password: "unused" }))).returning();
    ids.teachers.push(...teachers.map(row => row.id));
    const classes = await application.db.insert(schema.class_).values(teachers.map((teacher, index) => ({ name: `权限班级${index}`, semesterId: semester!.id, teacherId: teacher.id }))).returning();
    ids.classes.push(...classes.map(row => row.id));
    const students = await application.db.insert(schema.student).values([
        { studentId: `ps-${suffix}-0`, name: "班内学生", password: "unused", classId: classes[0]!.id },
        { studentId: `ps-${suffix}-1`, name: "同班同学", password: "unused", classId: classes[0]!.id },
        { studentId: `ps-${suffix}-2`, name: "外班学生", password: "unused", classId: classes[1]!.id },
    ]).returning();
    ids.students.push(...students.map(row => row.id));
    const topics = await application.db.insert(schema.topic).values(teachers.map((teacher, index) => ({
        teacherId: teacher.id, name: `权限模板${index}`, status: 0, excelFilePath: storagePath, excelRowCount: 3,
        fieldMapping: mapping, variableDictionary: null, variableRevision: 0,
    }))).returning();
    ids.topics.push(...topics.map(row => row.id));
    // 教师 A 的模板先确认一份有效字典，再发布并分配（冻结前完成编辑）
    const loaded = await variableSource.readVariableSource(storagePath, mapping);
    const dictionary = (await import("../domain/variables/dictionary")).suggestDictionary(loaded.rows, loaded.source, 0);
    expect(await dictionaryService.putTeacherVariableDictionary({ teacherId: teachers[0]!.id, topicId: topics[0]!.id, body: { source: loaded.source, observedRevision: 0, dictionary } })).toEqual({ ok: true, revision: 1 });
    await application.db.update(schema.topic).set({ status: 1 }).where(inArray(schema.topic.id, topics.map(row => row.id)));
    const tasks = await application.db.insert(schema.task).values(topics.map((topic, index) => ({ topicId: topic.id, classId: classes[index]!.id }))).returning();

    const replay = await (await import("../student/experiment/sampling-service")).executeSamplingAction({
        method: "simple", rawParams: { sampleSize: 2, seed: 5 }, targetSampleSize: 2, population: loaded.designRows, fieldMapping: mapping,
    });
    if (!replay.ok) throw new Error(replay.errorMessage);
    const { data: _data, ...storedResult } = replay.result;
    const [experiment] = await application.db.insert(schema.experiment).values({
        studentId: students[0]!.id, taskId: tasks[0]!.id, currentStage: 4, status: "submitted", samplingGeneration: 1,
        samplingResults: { simple: { ...storedResult, serverGenerated: true } }, submittedAt: new Date(),
        submissionSnapshot: { topicName: "权限模板0", studentName: "班内学生", populationSize: 3, questionnaire: null, samplePlan: null, samplingResults: null, reportContent: "", analysisAppendices: [] },
    }).returning();
    const dictionaryBody = (label: string) => ({
        source: loaded.source, observedRevision: 1,
        dictionary: { ...dictionary, revision: 1, variables: dictionary.variables.map(variable => variable.field === "value" ? { ...variable, label } : variable) },
    });
    return { teachers, classes, students, topics, tasks, experiment: experiment!, dictionaryBody };
}

pgTest("P0 unauthenticated and wrong-role requests are rejected without side effects", async () => {
    const f = await fixture();
    const before = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, f.topics[0]!.id)))[0]!;
    const teacherRoute = withTeacherAuth(topicVariableRoutes);
    const studentToken = await session(3, f.students[0]!.id);
    const teacherToken = await session(2, f.teachers[0]!.id);

    for (const method of ["GET", "PUT"] as const) {
        const response = await teacherRoute[method]!(request(method, { id: String(f.topics[0]!.id) }, { body: method === "PUT" ? f.dictionaryBody("未授权") : undefined }));
        expect((await status(response)).status, `teacher dictionary ${method} without cookie`).toBe(401);
        // 学生 Cookie 不能冒充教师
        const asStudent = await teacherRoute[method]!(request(method, { id: String(f.topics[0]!.id) }, { cookie: `student_session=${studentToken}`, body: method === "PUT" ? f.dictionaryBody("学生写入") : undefined }));
        expect((await status(asStudent)).status, `teacher dictionary ${method} with student cookie`).toBe(401);
    }
    for (const method of ["GET", "POST"] as const) {
        const response = await savedAnalysisRoutes[method]!(request(method, { id: String(f.tasks[0]!.id) }, { body: method === "POST" ? { requestId: "perm-12345678", observedVersion: 1, config: { question: "研究问题足够长吗？", field: "value", method: "simple", weighted: false } } : undefined }));
        expect((await status(response)).status, `student analyses ${method} without cookie`).toBe(401);
        const asTeacher = await savedAnalysisRoutes[method]!(request(method, { id: String(f.tasks[0]!.id) }, { cookie: `teacher_session=${teacherToken}`, body: method === "POST" ? { requestId: "perm-12345678", observedVersion: 1, config: { question: "研究问题足够长吗？", field: "value", method: "simple", weighted: false } } : undefined }));
        expect((await status(asTeacher)).status, `student analyses ${method} with teacher cookie`).toBe(401);
    }
    const grading = await withTeacherAuth(gradingDetailRoutes).GET!(request("GET", { id: String(f.experiment.id) }, { cookie: `student_session=${studentToken}` }));
    expect((await status(grading)).status).toBe(401);
    const submission = await submissionByTaskRoutes.GET!(request("GET", { id: String(f.tasks[0]!.id) }));
    expect((await status(submission)).status).toBe(401);

    const after = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, f.topics[0]!.id)))[0]!;
    expect(after.variableDictionary).toEqual(before.variableDictionary);
    expect(after.variableRevision).toBe(before.variableRevision);
});

pgTest("P0 cross-teacher and cross-class access cannot read or write another owner's data", async () => {
    const f = await fixture();
    const teacherB = await session(2, f.teachers[1]!.id);
    // 教师 B 看不到教师 A 的模板字典，也不能写入
    const readForeign = await withTeacherAuth(topicVariableRoutes).GET!(request("GET", { id: String(f.topics[0]!.id) }, { cookie: `teacher_session=${teacherB}` }));
    expect((await status(readForeign)).status).toBe(404);
    const writeForeign = await withTeacherAuth(topicVariableRoutes).PUT!(request("PUT", { id: String(f.topics[0]!.id) }, { cookie: `teacher_session=${teacherB}`, body: f.dictionaryBody("越权") }));
    expect((await status(writeForeign)).status).toBe(404);
    // 教师 B 看不到教师 A 班级学生的提交
    const gradingForeign = await withTeacherAuth(gradingDetailRoutes).GET!(request("GET", { id: String(f.experiment.id) }, { cookie: `teacher_session=${teacherB}` }));
    expect((await status(gradingForeign)).status).toBe(404);

    // 同班其他学生与外班学生都看不到 A 的分析与提交
    const classmate = await session(3, f.students[1]!.id);
    const outsider = await session(3, f.students[2]!.id);
    for (const [label, token] of [["classmate", classmate], ["outsider", outsider]] as const) {
        expect((await status(await savedAnalysisRoutes.GET!(request("GET", { id: String(f.tasks[0]!.id) }, { cookie: `student_session=${token}` })))).status, `${label} analyses`).toBe(404);
        expect((await status(await submissionByTaskRoutes.GET!(request("GET", { id: String(f.tasks[0]!.id) }, { cookie: `student_session=${token}` })))).status, `${label} submission`).toBe(404);
        expect((await status(await savedAnalysisRoutes.POST!(request("POST", { id: String(f.tasks[0]!.id) }, { cookie: `student_session=${token}`, body: { requestId: "perm-87654321", observedVersion: 1, config: { question: "越权运行分析的问题？", field: "value", method: "simple", weighted: false } } })))).status, `${label} analysis post`).toBe(404);
    }
    // 模板字典未被越权写入
    const topic = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, f.topics[0]!.id)))[0]!;
    expect(topic.variableRevision).toBe(1);
});

pgTest("P0 identity mismatch, invalid ids and malformed bodies are rejected with stable codes", async () => {
    const f = await fixture();
    const studentToken = await session(3, f.students[0]!.id);
    const teacherToken = await session(2, f.teachers[0]!.id);
    const teacherRoute = withTeacherAuth(topicVariableRoutes);

    // 浏览器身份约束：expected_user_id 不等于会话用户
    const mismatch = await savedAnalysisRoutes.GET!(request("GET", { id: String(f.tasks[0]!.id) }, { cookie: `student_session=${studentToken}`, headers: { "X-Expected-User-Id": String(f.students[1]!.id) } }));
    expect(await status(mismatch)).toMatchObject({ status: 409, body: { error: { code: "SESSION_CHANGED" } } });

    for (const id of ["abc", "0", "-1"]) {
        expect((await status(await savedAnalysisRoutes.GET!(request("GET", { id }, { cookie: `student_session=${studentToken}` })))).status, `analysis id ${id}`).toBe(400);
        expect((await status(await teacherRoute.GET!(request("GET", { id }, { cookie: `teacher_session=${teacherToken}` })))).status, `dictionary id ${id}`).toBe(400);
        expect((await status(await withTeacherAuth(gradingDetailRoutes).GET!(request("GET", { id }, { cookie: `teacher_session=${teacherToken}` })))).status, `grading id ${id}`).toBe(400);
    }

    const rawRequest = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json", cookie: `student_session=${studentToken}` }, body: "{broken" });
    (rawRequest as Request & { params: Record<string, string> }).params = { id: String(f.tasks[0]!.id) };
    expect(await status(await savedAnalysisRoutes.POST!(rawRequest))).toMatchObject({ status: 400, body: { error: { code: "INVALID_JSON" } } });

    const extraFields = await teacherRoute.PUT!(request("PUT", { id: String(f.topics[0]!.id) }, { cookie: `teacher_session=${teacherToken}`, body: { ...f.dictionaryBody("含额外字段"), extra: true } }));
    expect(await status(extraFields)).toMatchObject({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } });

    const shortQuestion = await savedAnalysisRoutes.POST!(request("POST", { id: String(f.tasks[0]!.id) }, { cookie: `student_session=${studentToken}`, body: { requestId: "perm-short-1234", observedVersion: f.experiment.version, config: { question: "太短", field: "value", method: "simple", weighted: false } } }));
    expect(await status(shortQuestion)).toMatchObject({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } });

    const topic = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, f.topics[0]!.id)))[0]!;
    expect(topic.variableRevision).toBe(1);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
});

pgTest("P0 hostile HTML in labels and research questions is stored as text and never interpreted by the API", async () => {
    const f = await fixture();
    const teacherToken = await session(2, f.teachers[0]!.id);
    // 已发布的模板不能再改字典；另建一个未发布的模板验证敌意文本原样存为文本
    const publishedTopic = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, f.topics[0]!.id)))[0]!;
    const storedDictionary = publishedTopic.variableDictionary as { source: string; revision: number; variables: Array<{ field: string; label: string }> };
    const [unpublished] = await application.db.insert(schema.topic).values({
        teacherId: f.teachers[0]!.id, name: "未发布敌意文本模板", status: 0,
        excelFilePath: publishedTopic.excelFilePath, excelRowCount: publishedTopic.excelRowCount, fieldMapping: publishedTopic.fieldMapping,
        variableDictionary: null, variableRevision: 0,
    }).returning();
    ids.topics.push(unpublished!.id);
    const label = '<script>alert("x")</script>';
    const hostileBody = {
        source: storedDictionary.source, observedRevision: 0,
        dictionary: { ...storedDictionary, revision: 0, variables: storedDictionary.variables.map(variable => variable.field === "value" ? { ...variable, label } : variable) },
    };
    const response = await withTeacherAuth(topicVariableRoutes).PUT!(request("PUT", { id: String(unpublished!.id) }, { cookie: `teacher_session=${teacherToken}`, body: hostileBody }));
    expect(await status(response)).toMatchObject({ status: 200, body: { success: true } });
    const stored = (await application.db.select().from(schema.topic).where(eq(schema.topic.id, unpublished!.id)))[0]!;
    const variables = (stored.variableDictionary as { variables: Array<{ field: string; label: string }> }).variables;
    expect(variables.find(variable => variable.field === "value")!.label).toBe(label);

    const read = await withTeacherAuth(topicVariableRoutes).GET!(request("GET", { id: String(unpublished!.id) }, { cookie: `teacher_session=${teacherToken}` }));
    const body = await read.json() as { data: { dictionary: { variables: Array<{ field: string; label: string }> } } };
    expect(body.data.dictionary.variables.find(variable => variable.field === "value")!.label).toBe(label);
    // 只有学生自己的实验处于可编辑状态才能运行分析；此处实验已提交，先用真实服务路径验证问题串只作为参数校验
    const savedAnalysis = await import("../student/experiment/saved-analysis-service");
    await expect(savedAnalysis.createSavedAnalysis(f.students[0]!.id, f.classes[0]!.id, f.tasks[0]!.id, {
        requestId: `perm-html-${crypto.randomUUID()}`, observedVersion: f.experiment.version,
        config: { question: `<img src=x onerror=alert(1)> 的研究问题是否足够长？`, field: "value", method: "simple", weighted: false },
    })).rejects.toMatchObject({ code: "EXPERIMENT_LOCKED" });
    void savedAnalysis;
});
