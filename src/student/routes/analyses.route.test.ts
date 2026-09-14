import { beforeEach, expect, mock, test } from "bun:test";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import type { RouteDefinition } from "../../server/route-types";

// 分析 POST 不得接受可信来源字段；畸形配置必须在任何数据库读写之前被拒绝。

const validConfig = { question: "这个变量的平均水平是多少？", method: "simple", field: "score", weighted: false };
const validBody = () => ({ requestId: "req-12345678", observedVersion: 6, config: validConfig });

function post(body: unknown) {
    const request = new Request("https://example.com/api/student/tasks/3/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    (request as Request & { params?: Record<string, string> }).params = { id: "3" };
    return request;
}

async function callRoute(queue: { select?: unknown[] } = {}, body: unknown = validBody()) {
    const { db, operations } = createMockDb({ select: queue.select ?? [[]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock());
    const { savedAnalysisRoutes } = await import("./variables");
    const response = await (savedAnalysisRoutes as Required<Pick<RouteDefinition, "POST">>).POST(post(body));
    return { response, body: await response.json() as { success: boolean; error?: { code: string; message: string } }, operations };
}

beforeEach(() => {
    mock.restore();
});

test("A04 rejects extra trusted-source fields before touching the database", async () => {
    const forbidden = [
        ["rows", [{ y: 1 }]],
        ["weights", [1, 2]],
        ["result", { mean: 1 }],
        ["evidence", { source: "forged" }],
        ["algorithmVersion", "forged-v9"],
        ["source", "population.csv"],
        ["fieldMapping", { numeric: ["score"] }],
        ["samplingResult", { serverGenerated: true }],
    ] as Array<[string, unknown]>;
    for (const [key, value] of forbidden) {
        const { response, body, operations } = await callRoute({}, { ...validBody(), [key]: value });
        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe("VALIDATION_ERROR");
        expect(operations.filter(operation => operation.kind !== "transaction")).toHaveLength(0);
    }
});

test("A04 rejects malformed config and request identity", async () => {
    const cases: Array<[string, unknown]> = [
        ["config extra key", { ...validBody(), config: { ...validConfig, source: "forged" } }],
        ["config missing weighted", { ...validBody(), config: { question: validConfig.question, method: validConfig.method, field: validConfig.field } }],
        ["question 4 chars", { ...validBody(), config: { ...validConfig, question: "abcd" } }],
        ["question 501 chars", { ...validBody(), config: { ...validConfig, question: "问".repeat(501) } }],
        ["invalid method", { ...validBody(), config: { ...validConfig, method: "quota" } }],
        ["non-boolean weighted", { ...validBody(), config: { ...validConfig, weighted: "yes" } }],
        ["empty field", { ...validBody(), config: { ...validConfig, field: "" } }],
        ["config array", { ...validBody(), config: [validConfig] }],
        ["config null", { ...validBody(), config: null }],
        ["requestId short", { ...validBody(), requestId: "short" }],
        ["requestId illegal character", { ...validBody(), requestId: "req_12345678" }],
        ["observedVersion zero", { ...validBody(), observedVersion: 0 }],
        ["observedVersion fractional", { ...validBody(), observedVersion: 1.5 }],
        ["observedVersion string", { ...validBody(), observedVersion: "6" }],
        ["body array", [validBody()]],
        ["body null", null],
        ["body primitive", "config"],
    ];
    for (const [label, payload] of cases) {
        const { response, body, operations } = await callRoute({}, payload);
        expect(response.status, label).toBe(400);
        expect(body.success, label).toBe(false);
        // 非对象请求体由共享的 parseBody 拒绝（INVALID_JSON），其余到达分析请求校验
        expect(["VALIDATION_ERROR", "INVALID_JSON"], label).toContain(body.error?.code ?? "");
        expect(operations.filter(operation => operation.kind !== "transaction"), label).toHaveLength(0);
    }
});

test("A04 accepts boundary-length questions and only then performs the ownership lookup", async () => {
    for (const question of ["abcde", "问".repeat(500)]) {
        const { response, operations } = await callRoute({ select: [[]] }, { ...validBody(), config: { ...validConfig, question } });
        // 没有所属实验：证明请求形状已通过，进入 404 归属检查而不是 400 校验
        expect(response.status).toBe(404);
        expect(operations.some(operation => operation.kind === "select")).toBe(true);
    }
});

test("A04 rejects unanalysable variables and unfinished sampling results before the worker", async () => {
    const dictionary = {
        source: "source-hash",
        revision: 3,
        variables: [
            { field: "id", label: "编号", unit: "", kind: "identifier", categories: [], missing: [] },
            { field: "score", label: "分数", unit: "", kind: "continuous", categories: [], missing: [] },
        ],
    };
    const context = {
        record: {
            id: 9, studentId: 2, taskId: 3, version: 6, currentStage: 4, status: "in_progress",
            samplingGeneration: 0, stage4CompletedAt: null,
            samplingResults: { simple: { completed: true, sampleCount: 1, seed: 1, indices: [0] } },
        },
        template: { variableDictionary: dictionary, variableRevision: 3, excelFilePath: "/storage/test/population.csv" },
        deadline: new Date(Date.now() + 60_000),
        openTime: null,
    };
    const withField = (field: string) => ({ ...validBody(), config: { ...validConfig, field } });

    const identifier = await callRoute({ select: [[context], [], []] }, withField("id"));
    expect(identifier.response.status).toBe(400);
    expect(identifier.body.error?.message).toMatch(/不可用于分析/);

    const missing = await callRoute({ select: [[context], [], []] }, withField("ghost"));
    expect(missing.response.status).toBe(400);
    expect(missing.body.error?.message).toMatch(/不可用于分析/);

    const unfinished = await callRoute({ select: [[{ ...context, record: { ...context.record, samplingResults: {} } }], [], []] }, withField("score"));
    expect(unfinished.response.status).toBe(400);
    expect(unfinished.body.error?.message).toMatch(/请先完成所选抽样方法/);

    const staleVersion = await callRoute({ select: [[context], [], []] }, { ...validBody(), observedVersion: 5 });
    expect(staleVersion.response.status).toBe(409);
    expect(staleVersion.body.error?.code).toBe("VERSION_CONFLICT");
});
