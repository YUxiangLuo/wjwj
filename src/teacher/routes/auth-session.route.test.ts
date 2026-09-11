import { expect, mock, test } from "bun:test";
import { userSession } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

const validSession = {
    id: 1,
    sessionToken: "teacher-token",
    userType: 2,
    userId: 9,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
};
const teacherRow = { id: 9, employeeId: "T001", name: "教师一", status: 1 };

async function loadAuth(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?session=${crypto.randomUUID()}`);
    return { module, operations };
}

function request(path: string, init: RequestInit = {}) {
    return new Request(`https://example.com${path}`, init);
}

test("teacher me returns the authenticated user behind a valid session cookie", async () => {
    const { module } = await loadAuth([[validSession], [teacherRow]]);

    const response = await module.withTeacherAuth(module.teacherMeRoutes).GET!(
        request("/api/teacher/me", { headers: { cookie: "teacher_session=teacher-token" } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id: 9, type: "teacher", employeeId: "T001" } });
});

test("teacher me rejects a request without a session cookie before any query", async () => {
    const { module, operations } = await loadAuth([]);

    const response = await module.withTeacherAuth(module.teacherMeRoutes).GET!(request("/api/teacher/me"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(operations).toHaveLength(0);
});

test("teacher me reports SESSION_CHANGED when the pinned identity no longer matches", async () => {
    const { module } = await loadAuth([[validSession]]);

    const response = await module.withTeacherAuth(module.teacherMeRoutes).GET!(
        request("/api/teacher/me", { headers: { cookie: "teacher_session=teacher-token", "X-Expected-User-Id": "999" } }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "SESSION_CHANGED" } });
});

test("teacher me treats an expired session as unauthenticated and removes it", async () => {
    const expired = { ...validSession, expiresAt: new Date(Date.now() - 60_000) };
    const { module, operations } = await loadAuth([[expired]]);

    const response = await module.withTeacherAuth(module.teacherMeRoutes).GET!(
        request("/api/teacher/me", { headers: { cookie: "teacher_session=teacher-token" } }),
    );

    expect(response.status).toBe(401);
    expect(operations.some((operation) => operation.kind === "delete" && operation.table === userSession)).toBe(true);
});

test("teacher logout revokes the token without clearing the browser cookie", async () => {
    const { module, operations } = await loadAuth([[validSession]]);

    const response = await module.teacherLogoutRoutes.POST!(
        request("/api/teacher/logout", { method: "POST", headers: { cookie: "teacher_session=teacher-token" } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { ok: true } });
    expect(response.headers.get("set-cookie")).toBeNull();
    const removal = operations.find((operation) => operation.kind === "delete" && operation.table === userSession);
    expect(removal).toBeTruthy();
});

test("teacher logout is idempotent without a session cookie", async () => {
    const { module, operations } = await loadAuth([]);

    const response = await module.teacherLogoutRoutes.POST!(request("/api/teacher/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(operations).toHaveLength(0);
});

test("teacher logout refuses a mismatched identity instead of revoking the session", async () => {
    const { module, operations } = await loadAuth([[validSession]]);

    const response = await module.teacherLogoutRoutes.POST!(
        request("/api/teacher/logout", { method: "POST", headers: { cookie: "teacher_session=teacher-token", "X-Expected-User-Id": "999" } }),
    );

    expect(response.status).toBe(409);
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});
