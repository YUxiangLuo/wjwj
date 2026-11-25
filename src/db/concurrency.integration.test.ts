import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import type { StoredExperimentWave, WaveFieldworkData } from "../domain/fieldwork";
import type { QuestionnaireData } from "../lib/questionnaire-types";
import * as schema from "./schema";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;
let application: typeof import("./index");
let raw: SQL;
let management: typeof import("../admin/routes/management");
let classroom: typeof import("../teacher/routes/classroom");
let grading: typeof import("../teacher/routes/grading");
let teacherAuth: typeof import("../teacher/routes/auth");
let studentAuth: typeof import("../student/routes/auth");
let studentExperiment: typeof import("../student/routes/experiment");
let taskService: typeof import("../teacher/topic/task-service");
const ids = { semesters: [] as number[], teachers: [] as number[], classes: [] as number[], students: [] as number[], topics: [] as number[] };

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    [management, classroom, grading, teacherAuth, studentAuth, studentExperiment, taskService] = await Promise.all([
        import("../admin/routes/management"), import("../teacher/routes/classroom"), import("../teacher/routes/grading"),
        import("../teacher/routes/auth"), import("../student/routes/auth"), import("../student/routes/experiment"), import("../teacher/topic/task-service"),
    ]);
});

afterEach(async () => {
    if (!required) return;
    const { db } = application;
    if (ids.students.length) {
        await db.delete(schema.userSession).where(and(eq(schema.userSession.userType, 3), inArray(schema.userSession.userId, ids.students)));
        await db.delete(schema.student).where(inArray(schema.student.id, ids.students));
    }
    if (ids.classes.length) {
        await db.delete(schema.task).where(inArray(schema.task.classId, ids.classes));
        await db.delete(schema.class_).where(inArray(schema.class_.id, ids.classes));
    }
    if (ids.topics.length) await db.delete(schema.topic).where(inArray(schema.topic.id, ids.topics));
    if (ids.semesters.length) await db.delete(schema.semester).where(inArray(schema.semester.id, ids.semesters));
    if (ids.teachers.length) {
        await db.delete(schema.userSession).where(and(eq(schema.userSession.userType, 2), inArray(schema.userSession.userId, ids.teachers)));
        await db.delete(schema.auditEvent).where(and(eq(schema.auditEvent.actorType, "teacher"), inArray(schema.auditEvent.actorId, ids.teachers)));
        await db.delete(schema.teacher).where(inArray(schema.teacher.id, ids.teachers));
    }
    for (const values of Object.values(ids)) values.length = 0;
});
afterAll(async () => { if (required) { await application?.closeDatabase(); await raw?.close(); } });

function request(method: string, params: Record<string, string>, body?: unknown, cookie?: string, query = "") {
    const req = new Request(`http://localhost${query}`, {
        method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    (req as Request & { params: Record<string, string> }).params = params;
    return req;
}

async function waitUntil(check: () => Promise<boolean>) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
        if (await check()) return;
        await Bun.sleep(5);
    }
    throw new Error("Timed out waiting for the controlled database interleaving");
}
async function blocked(needle: string) {
    const rows = await raw`select query from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
    return rows.some((row: { query: string }) => row.query.includes(needle));
}
async function holdRow(table: "semester" | "experiment" | "user_session", id: number) {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const transaction = raw.begin(async tx => {
        await tx.unsafe(`select id from ${table} where id = $1 for update`, [id]);
        acquired.resolve();
        await release.promise;
    });
    await acquired.promise;
    return async () => { release.resolve(); await transaction; };
}
async function addSemester(isCurrent = 0) {
    const [row] = await application.db.insert(schema.semester).values({ name: `race-${crypto.randomUUID().slice(0, 10)}`, isCurrent }).returning();
    ids.semesters.push(row!.id);
    return row!;
}
async function fixture(password = "unchanged-password") {
    const { db } = application;
    const semester = await addSemester();
    const teachers = await db.insert(schema.teacher).values([1, 2].map(() => ({ employeeId: crypto.randomUUID(), name: "并发教师", password: "unused" }))).returning();
    ids.teachers.push(...teachers.map(row => row.id));
    const [cls] = await db.insert(schema.class_).values({ name: "并发班级", semesterId: semester.id, teacherId: teachers[0]!.id }).returning();
    ids.classes.push(cls!.id);
    const students = await db.insert(schema.student).values([1, 2].map(() => ({ studentId: crypto.randomUUID(), name: "并发学生", password, classId: cls!.id }))).returning();
    ids.students.push(...students.map(row => row.id));
    return { teachers, cls: cls!, students };
}
async function addSubmission(group: Awaited<ReturnType<typeof fixture>>) {
    const { db } = application;
    const [topic] = await db.insert(schema.topic).values({ teacherId: group.teachers[0]!.id, name: "归属校验模板", status: 1 }).returning();
    ids.topics.push(topic!.id);
    const [task] = await db.insert(schema.task).values({ topicId: topic!.id, classId: group.cls.id }).returning();
    const [experiment] = await db.insert(schema.experiment).values({
        studentId: group.students[0]!.id, taskId: task!.id, status: "submitted", currentStage: 4, submittedAt: new Date(),
    }).returning();
    return { experiment: experiment!, taskId: task!.id, topicId: topic!.id };
}

async function session(userType: number, userId: number) {
    const token = crypto.randomUUID();
    await application.db.insert(schema.userSession).values({ userType, userId, sessionToken: token, expiresAt: new Date(Date.now() + 60000) });
    return token;
}


function importRequest(classId: number, csv: string, token: string) {
    const formData = new FormData();
    formData.append("file", new File([csv], "roster.csv", { type: "text/csv" }));
    const req = new Request("http://localhost", {
        method: "POST", headers: { cookie: `teacher_session=${token}` }, body: formData,
    });
    (req as Request & { params: Record<string, string> }).params = { classId: String(classId) };
    return req;
}

for (const first of ["select", "delete"] as const) {
    pgTest(`${first}-first semester selection/deletion preserves the current semester`, async () => {
        const a = await addSemester(1);
        const b = await addSemester();
        const release = await holdRow("semester", first === "select" ? a.id : b.id);
        const select = async () => management.semesterCurrentRoutes.PUT!(request("PUT", { id: String(b.id) }));
        const remove = async () => management.semesterDeleteRoutes.DELETE!(request("DELETE", { id: String(b.id) }));
        const leading = first === "select" ? select() : remove();
        let following: Promise<Response> | undefined;
        try {
            await waitUntil(() => blocked('"semester"'));
            let finished = false;
            following = (first === "select" ? remove() : select()).then(response => { finished = true; return response; });
            await waitUntil(async () => finished || await blocked("pg_advisory_xact_lock")
                || (first === "delete" && await blocked('update "semester"')));
        } finally { await release(); await Promise.allSettled([leading, following]); }
        expect((await leading).status).toBe(200);
        expect((await following!).status).toBe(first === "select" ? 400 : 404);
        const current = await application.db.select().from(schema.semester).where(eq(schema.semester.isCurrent, 1));
        expect(current.map(row => row.id)).toEqual([first === "select" ? b.id : a.id]);
    }, 15000);
}

pgTest("concurrent creation of current semesters succeeds serially and retains exactly one", async () => {
    const a = await addSemester(1);
    const release = await holdRow("semester", a.id);
    const names = [1, 2].map(() => `race-${crypto.randomUUID().slice(0, 10)}`);
    const create = async (name: string) => {
        const response = await management.semesterRoutes.POST!(request("POST", {}, { name, setAsCurrent: true }));
        const payload = await response.json() as { data?: { id: number } };
        if (payload.data?.id) ids.semesters.push(payload.data.id);
        return response.status;
    };
    const first = create(names[0]!);
    let second: Promise<number> | undefined;
    try {
        await waitUntil(() => blocked('update "semester"'));
        second = create(names[1]!);
        await waitUntil(async () => {
            const [row] = await raw`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
            return row.n >= 2;
        });
    } finally { await release(); await Promise.allSettled([first, second]); }
    expect(await first).toBe(201);
    expect(await second).toBe(201);
    const current = await application.db.select().from(schema.semester).where(eq(schema.semester.isCurrent, 1));
    expect(current.map(row => row.name)).toEqual([names[1]!]);
}, 15000);

for (const role of ["student", "teacher"] as const) {
    {
        pgTest(`admin ${role} reset rolls back the account update if session deletion fails`, async () => {
            const { db } = application;
            const group = await fixture();
            const account = role === "student" ? group.students[0]! : group.teachers[0]!;
            const table = role === "student" ? schema.student : schema.teacher;
            const userType = role === "student" ? 3 : 2;
            const token = crypto.randomUUID();
            await db.insert(schema.userSession).values({ userType, userId: account.id, sessionToken: token, expiresAt: new Date(Date.now() + 60000) });
            await raw.unsafe(`CREATE FUNCTION review_session_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                IF OLD.user_type = ${userType} AND OLD.user_id = ${account.id} THEN RAISE EXCEPTION 'injected session deletion failure'; END IF;
                RETURN OLD; END $$`);
            const route = role === "student" ? management.studentResetPasswordRoutes : management.teacherResetPasswordRoutes;
            const invoke = () => route.POST!(request("POST", { id: String(account.id) }));
            try {
                await raw.unsafe("CREATE TRIGGER review_session_delete_failure BEFORE DELETE ON user_session FOR EACH ROW EXECUTE FUNCTION review_session_delete_failure()");
                await expect(Promise.resolve(invoke())).rejects.toThrow();
                const [unchanged] = await db.select().from(table).where(eq(table.id, account.id));
                expect(unchanged!.password).toBe(account.password);
                expect(await db.select().from(schema.userSession).where(eq(schema.userSession.sessionToken, token))).toHaveLength(1);
            } finally {
                await raw.unsafe("DROP TRIGGER IF EXISTS review_session_delete_failure ON user_session");
                await raw.unsafe("DROP FUNCTION review_session_delete_failure()");
            }
            expect((await invoke()).status).toBe(200);
            expect(await db.select().from(schema.userSession).where(eq(schema.userSession.sessionToken, token))).toHaveLength(0);
            const [changed] = await db.select().from(table).where(eq(table.id, account.id));
            expect(changed!.password).not.toBe(account.password);
        });
    }
}

pgTest("a delayed logout revokes A without mutating B's session or browser cookie", async () => {
    const group = await fixture();
    const tokens = [crypto.randomUUID(), crypto.randomUUID()];
    const sessions = await application.db.insert(schema.userSession).values(group.students.map((account, index) => ({
        userType: 3, userId: account.id, sessionToken: tokens[index]!, expiresAt: new Date(Date.now() + 60_000),
    }))).returning();
    const release = await holdRow("user_session", sessions[0]!.id);
    const oldRequest = request("POST", {}, undefined, `student_session=${tokens[0]}`);
    oldRequest.headers.set("X-Expected-User-Id", String(group.students[0]!.id));
    const pending = studentAuth.logoutRoutes.POST!(oldRequest);
    try {
        await waitUntil(() => blocked('delete from "user_session"'));
        const b = await studentAuth.meRoutes.GET!(request("GET", {}, undefined, `student_session=${tokens[1]}`));
        expect(b.status).toBe(200);
        expect((await b.json()).data.id).toBe(group.students[1]!.id);
    } finally {
        await release();
    }
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(await application.db.select().from(schema.userSession).where(eq(schema.userSession.sessionToken, tokens[0]!))).toHaveLength(0);
    expect(await application.db.select().from(schema.userSession).where(eq(schema.userSession.sessionToken, tokens[1]!))).toHaveLength(1);
    const revoked = await studentAuth.meRoutes.GET!(request("GET", {}, undefined, `student_session=${tokens[0]}`));
    expect(revoked.status).toBe(401);
}, 15000);

pgTest("login skips expired sessions locked by another student's password rotation", async () => {
    const { db } = application;
    const password = "OriginalPassword!123";
    const group = await fixture(await Bun.password.hash(password));
    const [a, b] = group.students;
    const validToken = crypto.randomUUID();
    const rows = await db.insert(schema.userSession).values([
        { userType: 3, userId: a!.id, sessionToken: crypto.randomUUID(), expiresAt: new Date(Date.now() - 20000) },
        { userType: 3, userId: b!.id, sessionToken: crypto.randomUUID(), expiresAt: new Date(Date.now() - 10000) },
        { userType: 3, userId: b!.id, sessionToken: validToken, expiresAt: new Date(Date.now() + 60000) },
    ]).returning();
    const release = await holdRow("user_session", rows[2]!.id);
    const rotating = studentAuth.passwordRoutes.PUT!(request("PUT", {}, { currentPassword: password, newPassword: "ChangedPassword!456" }, `student_session=${validToken}`));
    let signingIn: Promise<Response> | undefined;
    let beforeRelease: Response | null = null;
    try {
        await waitUntil(() => blocked('"user_session"."user_type"'));
        // Ensure rotation already holds the expired B row, not just the valid one.
        await expect(raw`select id from user_session where id = ${rows[1]!.id} for update nowait`.execute()).rejects.toMatchObject({ errno: "55P03" });
        signingIn = Promise.resolve(studentAuth.loginRoutes.POST!(request("POST", {}, { studentId: a!.studentId, password })));
        beforeRelease = await Promise.race([signingIn, Bun.sleep(3000).then(() => null)]);
    } finally { await release(); await Promise.allSettled([rotating, signingIn]); }
    expect(beforeRelease?.status).toBe(200);
    expect((await rotating).status).toBe(200);
    expect((await signingIn!).status).toBe(200);
    const sessions = await db.select().from(schema.userSession).where(inArray(schema.userSession.userId, [a!.id, b!.id]));
    expect(sessions).toHaveLength(2);
    expect(sessions.every(row => row.expiresAt > new Date())).toBe(true);
    expect(sessions.some(row => row.sessionToken === validToken)).toBe(false);
}, 15000);

pgTest("re-importing an active roster row neither duplicates nor rewrites the account", async () => {
    const group = await fixture();
    const token = await session(2, group.teachers[0]!.id);
    const studentId = `RBTEST-${crypto.randomUUID().slice(0, 8)}`;

    await teacherAuth.withTeacherAuth(classroom.classStudentsRoutes).POST!(request(
        "POST", { classId: String(group.cls.id) }, { studentId, name: "原名" }, `teacher_session=${token}`,
    ));
    const [row] = await application.db.select().from(schema.student).where(eq(schema.student.studentId, studentId));
    ids.students.push(row!.id);

    const imported = await teacherAuth.withTeacherAuth(classroom.classStudentsImportRoutes).POST!(
        importRequest(group.cls.id, `studentId,name\n${studentId},改名\n`, token),
    );
    const payload = await imported.json() as any;

    expect(imported.status).toBe(200);
    expect(payload.data).toMatchObject({ successCount: 0, skippedCount: 1, failureCount: 0 });
    const rows = await application.db.select().from(schema.student).where(eq(schema.student.studentId, studentId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("原名");
    expect(rows[0]!.password).toBe(row!.password);
});

pgTest("a class keeps its teacher: reassignment is not a supported write path", async () => {
    const { db } = application;
    const group = await fixture();
    const { experiment } = await addSubmission(group);
    const oldTeacherToken = await session(2, group.teachers[0]!.id);
    const newTeacherToken = await session(2, group.teachers[1]!.id);
    const gradeBody = { observedVersion: experiment.version, scoreQuestionnaire: 80, scoreProcess: 80, scoreReport: 80 };

    // Simulate an out-of-band repair: point the class at the other teacher.
    await db.update(schema.class_).set({ teacherId: group.teachers[1]!.id }).where(eq(schema.class_.id, group.cls.id));

    // Grading is experiment-scoped and hides foreign work behind 404.
    const staleGrade = await teacherAuth.withTeacherAuth(grading.gradingDetailRoutes).POST!(
        request("POST", { id: String(experiment.id) }, gradeBody, `teacher_session=${oldTeacherToken}`),
    );
    expect(staleGrade.status).toBe(404);

    const staleImport = await teacherAuth.withTeacherAuth(classroom.classStudentsImportRoutes).POST!(
        importRequest(group.cls.id, `studentId,name\nRQ-${crypto.randomUUID().slice(0, 6)},学生\n`, oldTeacherToken),
    );
    expect(staleImport.status).toBe(403);

    const currentGrade = await teacherAuth.withTeacherAuth(grading.gradingDetailRoutes).POST!(
        request("POST", { id: String(experiment.id) }, gradeBody, `teacher_session=${newTeacherToken}`),
    );
    expect(currentGrade.status).toBe(200);
});

pgTest("hard deleting a student requires confirming the cascaded submissions", async () => {
    const group = await fixture();
    const { experiment } = await addSubmission(group);
    const token = await session(2, group.teachers[0]!.id);

    const refused = await teacherAuth.withTeacherAuth(classroom.studentRoutes).DELETE!(
        request("DELETE", { id: String(group.students[0]!.id) }, undefined, `teacher_session=${token}`),
    );
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: "SUBMISSIONS_EXIST" } });
    expect(await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, experiment.id))).toHaveLength(1);

    const confirmed = await teacherAuth.withTeacherAuth(classroom.studentRoutes).DELETE!(
        request("DELETE", { id: String(group.students[0]!.id) }, undefined, `teacher_session=${token}`, "?confirm=1"),
    );
    expect(confirmed.status).toBe(200);
    expect(await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, experiment.id))).toHaveLength(0);
});

pgTest("task DELETE binds confirmation to the current preview and cannot bypass it via query", async () => {
    const group = await fixture();
    const { experiment, taskId } = await addSubmission(group);
    const routes = await import("../teacher/routes/topic-task");
    const token = await session(2, group.teachers[0]!.id);
    const cookie = `teacher_session=${token}`;
    const params = { id: String(taskId) };
    const preview = await teacherAuth.withTeacherAuth(routes.taskDeletionPreviewRoutes).GET!(request("GET", params, undefined, cookie));
    const { impact } = (await preview.json()).data;
    expect(impact).toEqual({ experiments: 1, submitted: 1, graded: 0 });
    const remove = (body?: unknown, query = "") => teacherAuth.withTeacherAuth(routes.taskItemRoutes).DELETE!(request("DELETE", params, body, cookie, query));
    const missing = await remove(undefined, "?confirm=1");
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ error: { code: "DELETION_IMPACT_CHANGED" } });
    expect((await remove({ confirm: "true", expectedImpact: impact })).status).toBe(400);
    expect((await remove({ confirm: true, expectedImpact: { ...impact, experiments: -1 } })).status).toBe(400);
    await application.db.update(schema.experiment).set({ status: "graded" }).where(eq(schema.experiment.id, experiment.id));
    const stale = await remove({ confirm: true, expectedImpact: impact });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "DELETION_IMPACT_CHANGED" } });
    expect(await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, experiment.id))).toHaveLength(1);
    const refreshed = await taskService.getTaskDeletionImpact({ teacherId: group.teachers[0]!.id, taskId });
    expect((await remove({ expectedImpact: refreshed }, "?confirm=1")).status).toBe(200);
    expect(await application.db.select().from(schema.task).where(eq(schema.task.id, taskId))).toHaveLength(0);
    expect(await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, experiment.id))).toHaveLength(0);
});

for (const entity of ["student", "task"] as const) {
    for (const first of ["submit", "delete"] as const) {
        pgTest(`${first}-first ${entity} deletion serializes existing submissions before counting the cascade`, async () => {
            const group = await fixture();
            const { experiment, taskId } = await addSubmission(group);
            await application.db.update(schema.experiment).set({ status: "in_progress", submittedAt: null }).where(eq(schema.experiment.id, experiment.id));
            const release = await holdRow("experiment", experiment.id);
            // Match submit-service's optimistic UPDATE. Parent row locks alone
            // do not conflict with this write to an existing experiment.
            const submit = async () => raw`update experiment set status='submitted', submitted_at=now(), version=version+1
                where id=${experiment.id} and status='in_progress' and version=${experiment.version} returning id`;
            const remove = () => entity === "student"
                ? classroom.deleteTeacherStudent({ teacherId: group.teachers[0]!.id, studentId: group.students[0]!.id })
                : taskService.deleteTeacherTask({ teacherId: group.teachers[0]!.id, taskId });
            let submission: ReturnType<typeof submit> | undefined;
            let deletion: ReturnType<typeof remove> | undefined;
            try {
                if (first === "submit") submission = submit(); else deletion = remove();
                await waitUntil(() => blocked(""));
                if (first === "submit") deletion = remove(); else submission = submit();
                await waitUntil(async () => {
                    const [row] = await raw`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`;
                    return row.n >= 2;
                });
            } finally {
                await release();
                await Promise.allSettled([submission, deletion]);
            }
            expect(await submission).toHaveLength(first === "submit" ? 1 : 0);
            expect(await deletion).toMatchObject(first === "submit" ? { ok: false, code: "SUBMISSIONS_EXIST" } : { ok: true });
            expect(await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, experiment.id))).toHaveLength(first === "submit" ? 1 : 0);
        }, 15000);
    }
}

pgTest("class deletion waits for an in-flight roster transaction before checking blockers", async () => {
    const group = await fixture();
    await application.db.delete(schema.student).where(eq(schema.student.classId, group.cls.id));
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const importing = raw.begin(async tx => {
        await tx`select id from class where id=${group.cls.id} for share`;
        const [row] = await tx`insert into student(student_id,name,password,class_id) values (${crypto.randomUUID()},'并发新学生','unused',${group.cls.id}) returning id`;
        ids.students.push(Number(row.id));
        ready.resolve();
        await release.promise;
    });
    await ready.promise;
    const deleting = management.classUpdateRoutes.DELETE!(request("DELETE", { id: String(group.cls.id) }));
    try { await waitUntil(() => blocked('"class"')); }
    finally { release.resolve(); await importing; await Promise.allSettled([deleting]); }
    const response = await deleting;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CLASS_IN_USE" } });
    expect(await application.db.select().from(schema.class_).where(eq(schema.class_.id, group.cls.id))).toHaveLength(1);
}, 15000);

pgTest("opposite-order overlapping roster imports retain row accounting without deadlocking", async () => {
    const group = await fixture();
    const token = await session(2, group.teachers[0]!.id);
    const prefix = `ORDER-${crypto.randomUUID().slice(0, 8)}`;
    const names = [`${prefix}-A`, `${prefix}-B`];
    // Pause before each transaction's second row. Without canonical sorting,
    // both first rows are inserted and each transaction then waits on the other.
    await raw.unsafe(`CREATE FUNCTION review_import_order_gate() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE first_id text; BEGIN
        IF NEW.student_id IN ('${names[0]}','${names[1]}') THEN
            first_id:=current_setting('review.first_import_id',true);
            IF first_id IS NULL OR first_id='' THEN PERFORM set_config('review.first_import_id',NEW.student_id,true);
            ELSE PERFORM pg_advisory_xact_lock(478232,CASE WHEN first_id='${names[0]}' THEN 1 ELSE 2 END); END IF;
        END IF; RETURN NEW; END $$`);
    await raw.unsafe("CREATE TRIGGER review_import_order_gate BEFORE INSERT ON student FOR EACH ROW EXECUTE FUNCTION review_import_order_gate()");
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const barrier = raw.begin(async tx => {
        await tx`select pg_advisory_xact_lock(478232,1)`;
        await tx`select pg_advisory_xact_lock(478232,2)`;
        ready.resolve(); await release.promise;
    });
    await ready.promise;
    const upload = (ordered: string[]) => teacherAuth.withTeacherAuth(classroom.classStudentsImportRoutes).POST!(
        importRequest(group.cls.id, `studentId,name\n${ordered.map(id => `${id},学生`).join("\n")}`, token),
    );
    const first = upload([...names].reverse());
    let second: Promise<Response> | undefined;
    try {
        try {
            await waitUntil(() => blocked('insert into "student"'));
            second = Promise.resolve(upload(names));
            await waitUntil(async () => {
                const [row] = await raw`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like 'insert into "student"%'`;
                return row.n >= 2;
            });
        } finally { release.resolve(); await barrier; await Promise.allSettled([first, second]); }
        const responses = await Promise.all([first, second!]);
        expect(responses.map(r => r.status)).toEqual([200, 200]);
        const payloads = await Promise.all(responses.map(r => r.json()));
        expect(payloads.map(p => p.data.successCount).sort()).toEqual([0, 2]);
        expect(payloads.map(p => p.data.skippedCount).sort()).toEqual([0, 2]);
        expect(payloads.every(p => p.data.failureCount === 0)).toBe(true);
        expect(payloads.find(p => p.data.skippedCount === 2).data.skipped.map((row: { row: number }) => row.row)).toEqual([2, 3]);
    } finally {
        await raw.unsafe("DROP TRIGGER review_import_order_gate ON student");
        await raw.unsafe("DROP FUNCTION review_import_order_gate()");
        const rows = await application.db.select().from(schema.student).where(inArray(schema.student.studentId, names));
        ids.students.push(...rows.map(row => row.id));
    }
}, 15000);

function samplingTestQuestionnaire(): QuestionnaireData {
    return {
        title: "并发抽样测试问卷",
        welcomeText: "<p>欢迎参与本次并发抽样测试调研问卷，请按实际情况认真填答。</p>",
        endingText: "<p>感谢参与本次并发抽样测试调研问卷，祝您工作学习顺利。</p>",
        questions: Array.from({ length: 5 }, (_, index) => ({
            id: `q${index + 1}`,
            type: "boolean" as const,
            content: `这是第 ${index + 1} 道并发抽样测试题？`,
        })),
    };
}

function samplingTestFieldwork(methods: Array<"simple" | "systematic">): WaveFieldworkData {
    return {
        methods: Object.fromEntries(methods.map((method) => [
            method,
            {
                method,
                dispatchSeed: 777,
                dispatchedAt: "2026-01-02T00:00:00Z",
                invitedCount: 2,
                records: [
                    {
                        unitIndex: 0,
                        stratum: "A",
                        status: "completed_clean" as const,
                        durationSeconds: 90,
                        answeredCount: 5,
                        totalQuestions: 5,
                        straightliner: false,
                        observedValues: {},
                    },
                    {
                        unitIndex: 1,
                        stratum: "A",
                        status: "completed_clean" as const,
                        durationSeconds: 95,
                        answeredCount: 5,
                        totalQuestions: 5,
                        straightliner: false,
                        observedValues: {},
                    },
                ],
            },
        ])),
    };
}

async function addSamplingExperimentFixture(stage: 2 | 4) {
    const { db } = application;
    const group = await fixture();
    const csvRelPath = `/storage/test-conc-sampling-${crypto.randomUUID()}.csv`;
    const csvAbsPath = `${process.cwd()}${csvRelPath}`;
    await Bun.write(csvAbsPath, "id,group,score\n1,A,10\n2,A,20\n3,B,30\n4,B,40\n");

    const [topic] = await db.insert(schema.topic).values({
        teacherId: group.teachers[0]!.id,
        name: `并发抽样模板-${crypto.randomUUID().slice(0, 6)}`,
        excelFilePath: csvRelPath,
        excelRowCount: 4,
        fieldMapping: {
            identifier: "id",
            numeric: ["score"],
            categorical: ["group"],
            stratified: ["group"],
            analysisTarget: { kind: "proportion", field: "group", value: "A" },
        },
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" },
        },
        status: 1,
    }).returning();
    ids.topics.push(topic!.id);

    const [task] = await db.insert(schema.task).values({
        topicId: topic!.id,
        classId: group.cls.id,
        deadline: new Date(Date.now() + 3_600_000),
    }).returning();

    const questionnaire = samplingTestQuestionnaire();
    const plan = {
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 4,
        finalSampleSize: 2,
    };
    const initialSimple = {
        completed: true,
        sampleCount: 2,
        seed: 12345,
        indices: [0, 1],
        serverGenerated: true,
    };
    const wavesData: StoredExperimentWave[] = stage === 2
        ? [{
            waveNumber: 1,
            kind: "pilot",
            label: "第 1 轮 · 首轮试投",
            questionnaire,
            samplePlan: plan,
            samplingResults: { simple: initialSimple },
            fieldwork: samplingTestFieldwork(["simple"]),
            cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
            completedAt: null,
        }]
        : [
            {
                waveNumber: 1,
                kind: "pilot",
                label: "第 1 轮 · 首轮试投",
                questionnaire,
                samplePlan: plan,
                samplingResults: { simple: initialSimple },
                fieldwork: samplingTestFieldwork(["simple"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: "2026-01-02T00:00:00Z",
            },
            {
                waveNumber: 2,
                kind: "main",
                label: "第 2 轮 · 调优正式投放",
                questionnaire,
                samplePlan: plan,
                samplingResults: null,
                fieldwork: null,
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            },
        ];

    const [exp] = await db.insert(schema.experiment).values({
        studentId: group.students[0]!.id,
        taskId: task!.id,
        version: stage === 2 ? 3 : 5,
        samplingGeneration: stage === 2 ? 2 : 1,
        status: "in_progress",
        currentStage: stage,
        activeWaveNumber: stage === 2 ? 1 : 2,
        questionnaire,
        samplePlan: plan,
        samplingResults: stage === 2 ? { simple: initialSimple } : null,
        wavesData,
        stage1CompletedAt: new Date("2026-01-01T00:00:00Z"),
        ...(stage === 4 ? {
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        } : {}),
    }).returning();

    const token = await session(3, group.students[0]!.id);
    return {
        experiment: exp!,
        taskId: task!.id,
        plan,
        cookie: `student_session=${token}`,
        cleanupFile: async () => {
            await Bun.file(csvAbsPath).delete().catch(() => undefined);
        },
    };
}

for (const first of ["sampling", "complete"] as const) {
    pgTest(`${first}-first concurrent sampling and stage 2 completion never desync experiment state or audit attempts`, async () => {
        const f = await addSamplingExperimentFixture(2);
        try {
            const release = await holdRow("experiment", f.experiment.id);
            const runSampling = async () => studentExperiment.samplingActionRoutes.POST!(request(
                "POST",
                { id: String(f.taskId) },
                { method: "simple", params: { sampleSize: 2, seed: 22222 } },
                f.cookie,
            ));
            const runComplete = async () => studentExperiment.stageCompleteRoutes.POST!(request(
                "POST",
                { id: String(f.taskId), stage: "2" },
                { observedVersion: f.experiment.version, samplePlan: f.plan },
                f.cookie,
            ));

            let samplingPromise: Promise<Response> | undefined;
            let completePromise: Promise<Response> | undefined;
            try {
                if (first === "sampling") samplingPromise = runSampling();
                else completePromise = runComplete();
                await waitUntil(() => blocked('"experiment"'));

                if (first === "sampling") completePromise = runComplete();
                else samplingPromise = runSampling();
                await waitUntil(async () => {
                    const [row] = await raw`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%"experiment"%'`;
                    return row.n >= 2;
                });
            } finally {
                await release();
                await Promise.allSettled([samplingPromise, completePromise]);
            }

            const samplingRes = await samplingPromise!;
            const completeRes = await completePromise!;
            expect([samplingRes.status, completeRes.status].sort()).toEqual([200, 409]);

            const [savedExp] = await application.db
                .select()
                .from(schema.experiment)
                .where(eq(schema.experiment.id, f.experiment.id));
            const attempts = await application.db
                .select()
                .from(schema.samplingAttempt)
                .where(eq(schema.samplingAttempt.experimentId, f.experiment.id));
            const waveRows = await application.db
                .select()
                .from(schema.experimentWave)
                .where(eq(schema.experimentWave.experimentId, f.experiment.id));

            if (samplingRes.status === 200) {
                expect(completeRes.status).toBe(409);
                expect(await completeRes.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
                expect(savedExp!.currentStage).toBe(2);
                expect(savedExp!.version).toBe(f.experiment.version);
                expect(savedExp!.samplingGeneration).toBe(f.experiment.samplingGeneration + 1);
                expect((savedExp!.samplingResults as { simple?: { seed?: number } })?.simple?.seed).toBe(22222);
                const wave1 = (savedExp!.wavesData as Array<{ waveNumber: number; samplingResults?: { simple?: { seed?: number } }; fieldwork?: unknown }>)[0]!;
                expect(wave1.samplingResults?.simple?.seed).toBe(22222);
                expect(wave1.fieldwork).toBeNull();
                expect(waveRows).toHaveLength(1);
                expect((waveRows[0]!.samplingResults as { simple?: { seed?: number } })?.simple?.seed).toBe(22222);
                expect(waveRows[0]!.fieldworkResults).toBeNull();
                expect(attempts).toHaveLength(1);
                expect(attempts[0]!.seed).toBe(22222);
            } else {
                expect(completeRes.status).toBe(200);
                expect(samplingRes.status).toBe(409);
                expect(await samplingRes.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
                expect(savedExp!.currentStage).toBe(3);
                expect(savedExp!.version).toBe(f.experiment.version + 1);
                expect(savedExp!.samplingGeneration).toBe(f.experiment.samplingGeneration);
                expect((savedExp!.samplingResults as { simple?: { seed?: number } })?.simple?.seed).toBe(12345);
                expect(attempts).toHaveLength(0);
            }
        } finally {
            await f.cleanupFile();
        }
    }, 15000);
}

pgTest("concurrent sampling of different methods preserves both methods without lost updates", async () => {
    const f = await addSamplingExperimentFixture(4);
    try {
        const release = await holdRow("experiment", f.experiment.id);
        const runSimple = async () => studentExperiment.samplingActionRoutes.POST!(request(
            "POST",
            { id: String(f.taskId) },
            { method: "simple", params: { sampleSize: 2, seed: 1001 } },
            f.cookie,
        ));
        const runSystematic = async () => studentExperiment.samplingActionRoutes.POST!(request(
            "POST",
            { id: String(f.taskId) },
            { method: "systematic", params: { seed: 1002 } },
            f.cookie,
        ));

        let simplePromise: Promise<Response> | undefined;
        let systematicPromise: Promise<Response> | undefined;
        try {
            simplePromise = runSimple();
            await waitUntil(() => blocked('"experiment"'));
            systematicPromise = runSystematic();
            await waitUntil(async () => {
                const [row] = await raw`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%"experiment"%'`;
                return row.n >= 2;
            });
        } finally {
            await release();
            await Promise.allSettled([simplePromise, systematicPromise]);
        }

        const [simpleRes, systematicRes] = await Promise.all([simplePromise!, systematicPromise!]);
        expect(simpleRes.status).toBe(200);
        expect(systematicRes.status).toBe(200);

        const [savedExp] = await application.db
            .select()
            .from(schema.experiment)
            .where(eq(schema.experiment.id, f.experiment.id));
        const sampling = savedExp!.samplingResults as Record<string, { completed?: boolean; seed?: number }> | null;
        expect(sampling?.simple).toMatchObject({ completed: true, seed: 1001 });
        expect(sampling?.systematic).toMatchObject({ completed: true, seed: 1002 });
        expect(savedExp!.samplingGeneration).toBe(f.experiment.samplingGeneration + 2);

        const wave2 = (savedExp!.wavesData as Array<{ waveNumber: number; samplingResults?: Record<string, { seed?: number }> }>)
            .find((wave) => wave.waveNumber === 2);
        expect(wave2?.samplingResults?.simple?.seed).toBe(1001);
        expect(wave2?.samplingResults?.systematic?.seed).toBe(1002);

        const waveRows = await application.db
            .select()
            .from(schema.experimentWave)
            .where(and(eq(schema.experimentWave.experimentId, f.experiment.id), eq(schema.experimentWave.waveNumber, 2)));
        expect(waveRows).toHaveLength(1);
        expect((waveRows[0]!.samplingResults as Record<string, { seed?: number }>)?.simple?.seed).toBe(1001);
        expect((waveRows[0]!.samplingResults as Record<string, { seed?: number }>)?.systematic?.seed).toBe(1002);

        const attempts = await application.db
            .select()
            .from(schema.samplingAttempt)
            .where(eq(schema.samplingAttempt.experimentId, f.experiment.id));
        expect(attempts.map((item) => item.method).sort()).toEqual(["simple", "systematic"]);
    } finally {
        await f.cleanupFile();
    }
}, 15000);
