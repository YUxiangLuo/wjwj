import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function createRequest(url: string) {
    return new Request(url, { method: "GET" });
}

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadFilesRoutes(options: {
    select?: unknown[];
    authStudent?: Record<string, unknown>;
} = {}) {
    const { db } = createMockDb(options);

    mock.restore();
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        requireAuth: async () => ({
            student: {
                id: 11,
                classId: 7,
                name: "Alice",
                studentId: "20230001",
                status: 1,
                isFirstLogin: 0,
                ...options.authStudent,
            },
            error: null,
            sessionExpiresAt: null,
        }),
    }));

    const module = await import(`./files?student-files-route-test=${Math.random()}`);
    return module;
}

test("export route reads serialized sampling results and returns csv", async () => {
    const module = await loadFilesRoutes({
        select: [
            [{ id: 40 }],
            [{
                samplingResults: JSON.stringify({
                    simple: { data: [{ id: 1, city: "北京" }] },
                    systematic: { data: [{ id: 2, city: "上海" }] },
                    stratified: { data: [{ id: 3, city: "广州" }] },
                }),
            }],
        ],
    });

    const request = withRouteParam(
        createRequest("https://example.com/api/student/tasks/40/export?type=all"),
        "40"
    );

    const response = await module.exportRoutes.GET!(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("all_sampling.csv");
    expect(body).toContain("__method");
    expect(body).toContain("simple");
    expect(body).toContain("systematic");
    expect(body).toContain("stratified");
    expect(body).toContain("北京");
    expect(body).toContain("上海");
    expect(body).toContain("广州");
});
