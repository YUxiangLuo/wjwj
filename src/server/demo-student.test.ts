import { expect, test } from "bun:test";

import { createDemoStudentRoutes, orderedDemoCandidates } from "./demo-student";

const rows = [
    { studentId: "S010", name: "林清", passwordHash: "hash-10", lockedUntil: null },
    { studentId: "S012", name: "吴敏", passwordHash: "hash-12", lockedUntil: null },
    { studentId: "S018", name: "锁定学生", passwordHash: "hash-18", lockedUntil: new Date(Date.now() + 60_000) },
];

test("demo student candidates rotate from the random starting point and exclude non-demo accounts", () => {
    expect(orderedDemoCandidates(rows, 0).map(({ account }) => account.studentId)).toEqual(["S010", "S012"]);
    expect(orderedDemoCandidates(rows, 0.75).map(({ account }) => account.studentId)).toEqual(["S012", "S010"]);
});

test("demo student credential route exists only in demo mode and never caches credentials", async () => {
    expect(createDemoStudentRoutes(false)).toEqual({});

    const routes = createDemoStudentRoutes(true, {
        loadCandidates: async () => rows,
        random: () => 0.75,
        verifyPassword: async (password, hash) => password === "Student!012" && hash === "hash-12",
    });
    const response = await routes["/api/demo/student-credential"]!.GET!(new Request("http://localhost/api/demo/student-credential"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
        success: true,
        data: { studentId: "S012", password: "Student!012" },
    });
});
