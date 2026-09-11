import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;
let application: typeof import("./index");
let raw: SQL;
let management: typeof import("../admin/routes/management");
let classroom: typeof import("../teacher/routes/classroom");
let teacherAuth: typeof import("../teacher/routes/auth");
let studentAuth: typeof import("../student/routes/auth");
const ids = { semesters: [] as number[], teachers: [] as number[], classes: [] as number[], students: [] as number[], topics: [] as number[] };

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    [management, classroom, teacherAuth, studentAuth] = await Promise.all([
        import("../admin/routes/management"), import("../teacher/routes/classroom"),
        import("../teacher/routes/auth"), import("../student/routes/auth"),
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

function request(method: string, params: Record<string, string>, body?: unknown, cookie?: string) {
    const req = new Request("http://localhost", {
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
