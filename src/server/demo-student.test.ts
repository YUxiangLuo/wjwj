import { expect, test } from "bun:test";

import { createDemoStudentRoutes, orderedDemoCandidates } from "./demo-student";

const rows = [
    { studentId: "S010", name: "林清", passwordHash: "S010" },
    { studentId: "S012", name: "吴敏", passwordHash: "S012" },
    { studentId: "S018", name: "非演示学生", passwordHash: "S018" },
];

const verifyMatchingPassword = async (password: string, hash: string) => password === hash;

test("demo student candidates rotate from the random starting point and exclude non-demo accounts", () => {
    expect(orderedDemoCandidates(rows, 0).map(({ account }) => account.studentId)).toEqual(["S010", "S012"]);
    expect(orderedDemoCandidates(rows, 0.75).map(({ account }) => account.studentId)).toEqual(["S012", "S010"]);
});

test("demo student credential route exists only in demo mode and never caches credentials", async () => {
    expect(createDemoStudentRoutes(false)).toEqual({});

    const routes = createDemoStudentRoutes(true, {
        loadCandidates: async () => rows,
        random: () => 0.75,
        verifyPassword: verifyMatchingPassword,
    });
    const response = await routes["/api/demo/student-credential"]!.GET!(new Request("http://localhost/api/demo/student-credential"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
        success: true,
        data: { studentId: "S012", password: "S012" },
    });
});

test("demo student credential skips accounts whose password no longer equals the student ID", async () => {
    const routes = createDemoStudentRoutes(true, {
        loadCandidates: async () => [
            { studentId: "S010", name: "林清", passwordHash: "changed-password" },
            { studentId: "S012", name: "吴敏", passwordHash: "S012" },
        ],
        random: () => 0,
        verifyPassword: verifyMatchingPassword,
    });

    const response = await routes["/api/demo/student-credential"]!.GET!(new Request("http://localhost/api/demo/student-credential"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { studentId: "S012", password: "S012" } });
});

test("demo student credential reports unavailable when every demo password has changed", async () => {
    const routes = createDemoStudentRoutes(true, {
        loadCandidates: async () => rows,
        random: () => 0,
        verifyPassword: async () => false,
    });

    const response = await routes["/api/demo/student-credential"]!.GET!(new Request("http://localhost/api/demo/student-credential"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "DEMO_STUDENT_UNAVAILABLE" } });
});
