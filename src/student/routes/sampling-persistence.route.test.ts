import { afterAll, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

const populationPath = `/storage/test-authoritative-sampling-${crypto.randomUUID()}.csv`;
const absolutePopulationPath = `${process.cwd()}${populationPath}`;
await Bun.write(absolutePopulationPath, "id,gender,weight\n1,A,1\n2,A,2\n3,B,3\n4,B,4\n");

afterAll(async () => {
    await Bun.file(absolutePopulationPath).delete().catch(() => undefined);
});

function validQuestionnaire() {
    return {
        title: "商业调研问卷",
        welcomeText: "欢迎参与本次商业统计调查实验，所有填答信息均严格匿名保密。",
        endingText: "衷心感谢您的宝贵配合与支持，祝您工作顺利、生活愉快。",
        questions: Array.from({ length: 5 }, (_, idx) => ({
            id: `q${idx}`,
            type: "boolean",
            content: `第${idx + 1}道商业调查问题？`,
        })),
    };
}

function fieldworkFor(methods: string[]) {
    return {
        methods: Object.fromEntries(methods.map((method) => [
            method,
            {
                method,
                dispatchSeed: 2026,
                dispatchedAt: "2026-01-03T00:00:00Z",
                invitedCount: 2,
                records: [
                    {
                        unitIndex: 0,
                        stratum: "A",
                        status: "completed_clean",
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

function record(overrides: Record<string, unknown> = {}) {
    return {
        id: 9,
        studentId: 2,
        taskId: 3,
        version: 6,
        samplingGeneration: 0,
        analysisReferences: [],
        status: "in_progress",
        currentStage: 4,
        activeWaveNumber: 2,
        questionnaire: validQuestionnaire(),
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 4, finalSampleSize: 2 },
        samplingResults: null,
        wavesData: [],
        reportContent: null,
        stage1CompletedAt: new Date("2026-01-01T00:00:00Z"),
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        stage4CompletedAt: null,
        stage5CompletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

async function load(
    experimentRecord: Record<string, unknown>,
    update: unknown[] = [[{ id: 9 }]],
    fieldMapping: Record<string, unknown> = { numeric: ["weight"], stratified: ["gender"] },
    filePath = populationPath,
    samplingPolicy?: unknown,
    schedule = { openTime: null as Date | null, deadline: new Date(Date.now() + 60_000) },
) {
    const { db, operations } = createMockDb({ select: [[experimentRecord], [experimentRecord]], update });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock({
        requireAuth: async () => ({ student: { id: 2, studentId: "S001", name: "学生一", classId: 7 }, error: null }),
    }));
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    mock.module("../experiment/task-info", () => ({
        findStudentTaskPopulationSize: async () => 4,
        findStudentTaskSamplingInfo: async () => ({
            excelFilePath: filePath,
            fieldMapping,
            samplingPolicy,
        }),
        findStudentTaskSchedule: async () => schedule,
        findStudentTaskSubmitInfo: async () => null,
        findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
    }));
    return {
        module: await import(`./experiment.ts?authoritative=${crypto.randomUUID()}`),
        operations,
    };
}

function routeRequest(path: string, body: unknown, params: Record<string, string>) {
    const request = new Request(`https://example.com${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    (request as Request & { params?: Record<string, string> }).params = params;
    return request;
}

for (const boundary of ["not-open", "expired"] as const) {
    test(`sampling rejects ${boundary} tasks before any results or audit writes`, async () => {
        const schedule = boundary === "expired"
            ? { openTime: null, deadline: new Date(Date.now() - 10_000) }
            : { openTime: new Date(Date.now() + 10_000), deadline: new Date(Date.now() + 60_000) };
        const { module, operations } = await load(record(), undefined, undefined, undefined, undefined, schedule);
        const response = await module.samplingActionRoutes.POST!(routeRequest(
            "/api/student/tasks/3/sampling", { method: "simple", params: { sampleSize: 2 } }, { id: "3" },
        ));
        expect(response.status).toBe(400);
        expect((await response.json() as any).error.code).toBe(boundary === "expired" ? "TASK_DEADLINE" : "TASK_NOT_OPEN");
        expect(operations.some(op => op.kind === "update" || op.kind === "insert")).toBe(false);
    });
}

test("sampling action ignores forged output fields and atomically persists its server-generated method result", async () => {
    const { module, operations } = await load(record());
    const response = await module.samplingActionRoutes.POST!(routeRequest(
        "/api/student/tasks/3/sampling",
        {
            method: "simple",
            params: {
                sampleSize: 2,
                seed: 2026,
                data: [{ id: "forged" }],
                indices: [3, 3],
                inclusionProbabilities: [1, 1],
                randomStart: -1,
                layers: [{ name: "forged", sampleCount: 2 }],
            },
        },
        { id: "3" },
    ));

    expect(response.status).toBe(200);
    const update = operations.find((operation) => operation.kind === "update");
    const samplingSet = (update?.set as { samplingResults?: Record<string, Record<string, unknown>> } | undefined)?.samplingResults;
    expect(samplingSet).toBeDefined();
    const storedResult = samplingSet?.simple as Record<string, unknown>;
    expect(storedResult).toMatchObject({ serverGenerated: true, indices: expect.any(Array) });
    expect(storedResult.indices).toEqual([3, 2]);
    expect(storedResult).not.toHaveProperty("data");
    expect(storedResult).not.toHaveProperty("inclusionProbabilities");
    expect(storedResult).not.toHaveProperty("randomStart");
    expect(storedResult).not.toHaveProperty("layers");

    const optimisticQuery = new PgDialect().sqlToQuery(update?.where as SQL);
    expect(optimisticQuery.params).toEqual([9, 6, "in_progress", 4, 0]);
    expect(operations.some((operation) => operation.kind === "select" && operation.lockStrength === "update")).toBe(true);

    const payload = await response.json() as any;
    expect(payload.data.result.data).toHaveLength(2);
    expect(payload.data.result).not.toHaveProperty("indices");
    expect(payload.data.result).not.toHaveProperty("inclusionProbabilities");

    const attemptInsert = operations.filter((operation) => operation.kind === "insert").find((operation) => (
        Boolean((operation.values as { method?: string } | undefined)?.method)
    ));
    expect(attemptInsert?.values).toMatchObject({
        experimentId: 9,
        waveNumber: 2,
        method: "simple",
        seed: 2026,
        sampleCount: 2,
    });
    expect((attemptInsert?.values as { details?: unknown })?.details).not.toHaveProperty("indices");
    expect((attemptInsert?.values as { details?: unknown })?.details).not.toHaveProperty("inclusionProbabilities");
    expect(operations.some((operation) => operation.kind === "transaction")).toBe(true);
});

test("sampling action rejects methods disabled by the experiment template", async () => {
    const { module, operations } = await load(
        record(),
        [[{ id: 9 }]],
        { numeric: ["weight"], stratified: ["gender"] },
        populationPath,
        { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
    );
    const response = await module.samplingActionRoutes.POST!(routeRequest(
        "/api/student/tasks/3/sampling",
        { method: "pps", params: { sampleSize: 2, sizeField: "weight" } },
        { id: "3" },
    ));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "SAMPLING_METHOD_DISABLED" } });
    expect(operations.some((operation) => operation.kind === "update")).toBeFalse();
});

test("sampling action rejects a positive numeric field outside the template PPS allowlist", async () => {
    const policy = {
        version: 1,
        methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" },
        ppsSizeFields: ["approved_size"],
    };
    const { module, operations } = await load(record(), [[{ id: 9 }]], undefined, populationPath, policy);
    const response = await module.samplingActionRoutes.POST!(routeRequest(
        "/api/student/tasks/3/sampling",
        { method: "pps", params: { sampleSize: 2, sizeField: "weight" } },
        { id: "3" },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "请选择实验模板指定的 PPS 规模变量" } });
    expect(operations.some((operation) => operation.kind === "update")).toBeFalse();
});

test("experiment reads hydrate compact stored indices for the SPA", async () => {
    const compact = record({
        status: "rejected",
        currentStage: 4,
        rejectReason: "请补充四种抽样方法的比较",
        samplingResults: {
            simple: { completed: true, sampleCount: 2, indices: [1, 3], serverGenerated: true },
        },
    });
    const { module } = await load(compact);
    const request = new Request("https://example.com/api/student/tasks/3/experiment");
    (request as Request & { params?: Record<string, string> }).params = { id: "3" };

    const response = await module.experimentRoutes.GET!(request);
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data.rejectReason).toBe("请补充四种抽样方法的比较");
    expect(payload.data.samplingResults.simple.data).toEqual([
        { id: "2", gender: "A", weight: 2 },
        { id: "4", gender: "B", weight: 4 },
    ]);
    expect(payload.data.samplingResults.simple).not.toHaveProperty("indices");
});

test("experiment reads fail closed when compact replay indices are corrupted", async () => {
    const compact = record({
        samplingResults: {
            simple: { completed: true, sampleCount: 2, indices: [1, 1], data: [], serverGenerated: true },
        },
    });
    const { module } = await load(compact);
    const request = new Request("https://example.com/api/student/tasks/3/experiment");
    (request as Request & { params?: Record<string, string> }).params = { id: "3" };

    const response = await module.experimentRoutes.GET!(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_SAMPLING_STORAGE" } });
});

test("forged stage completion cannot supply results or bypass an eligible PPS method", async () => {
    const { module, operations } = await load(record());
    const forged = {
        simple: { completed: true, sampleCount: 2 },
        systematic: { completed: true, sampleCount: 2 },
        pps: { unavailable: true },
        stratified: { completed: true, layers: [{ name: "A", sampleCount: 2 }] },
    };
    const response = await module.stageCompleteRoutes.POST!(routeRequest(
        "/api/student/tasks/3/experiment/stages/4/complete",
        { observedVersion: 6, samplingResults: forged },
        { id: "3", stage: "4" },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "SAMPLING_RESULTS_REQUIRED" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});

test("stage completion atomically persists server-determined PPS unavailability", async () => {
    const stored = {
        simple: { completed: true, sampleCount: 2, indices: [0, 1], serverGenerated: true },
        systematic: { completed: true, sampleCount: 2, indices: [0, 2], serverGenerated: true },
        stratified: {
            completed: true,
            sampleCount: 2,
            indices: [1, 3],
            serverGenerated: true,
            stratifyBy: "gender",
            layers: [{ name: "A", count: 2, sampleCount: 1 }, { name: "B", count: 2, sampleCount: 1 }],
        },
    };
    const pps = {
        unavailable: true,
        unavailableReason: "当前总体不存在对每个单位都为正数的规模变量",
        serverGenerated: true,
    };
    const q = validQuestionnaire();
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 4, finalSampleSize: 2 };
    const fw = fieldworkFor(["simple", "systematic", "stratified"]);
    const wave2 = (sr: Record<string, unknown>) => ({
        waveNumber: 2,
        kind: "main",
        label: "Wave 2",
        questionnaire: q,
        samplePlan: plan,
        samplingResults: sr,
        fieldwork: fw,
        cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
        completedAt: null,
    });
    const current = record({ samplingResults: stored, wavesData: [wave2(stored)] });
    const marked = { ...current, samplingGeneration: 1, samplingResults: { ...stored, pps }, wavesData: [wave2({ ...stored, pps })] };
    const updated = { ...marked, wavesData: [], currentStage: 5, version: 7, stage4CompletedAt: new Date() };
    const { module, operations } = await load(current, [[marked], [updated]], { numeric: [], stratified: ["gender"] });
    const response = await module.stageCompleteRoutes.POST!(routeRequest(
        "/api/student/tasks/3/experiment/stages/4/complete",
        { observedVersion: 6 },
        { id: "3", stage: "4" },
    ));

    expect(response.status).toBe(200);
    const updates = operations.filter((operation) => operation.kind === "update");
    expect(updates).toHaveLength(2);
    const markerSet = (updates[0]?.set as { samplingResults?: Record<string, unknown> }).samplingResults;
    expect(markerSet?.pps).toEqual(pps);
    expect((updates[1]?.set as { samplingResults?: Record<string, unknown> }).samplingResults?.pps).toEqual(pps);
});

test("frozen experiment and analysis reads reject changed sources, while editable experiments remain usable", async () => {
    const path = `/storage/frozen-read-${crypto.randomUUID()}.csv`;
    const absolute = `${process.cwd()}${path}`;
    const original = "id,gender,weight\n1,A,1\n2,A,2\n3,B,3\n4,B,4\n";
    const hash = new Bun.CryptoHasher("sha256").update(original).digest("hex");
    try {
        for (const status of ["submitted", "graded", "in_progress", "rejected"]) {
            for (const changed of [false, true, false]) {
                await Bun.write(absolute, changed ? original.replace("4,B,4", "4,B,9") : original);
                for (const route of ["experimentRoutes", "analysisMetricsRoutes"] as const) {
                    const { module } = await load(record({
                        status,
                        submissionSnapshot: { populationFileSha256: hash },
                        samplingResults: { simple: { completed: true, serverGenerated: true, seed: 2026, sampleCount: 2, indices: [3, 2] } },
                    }), undefined, undefined, path);
                    const request = new Request("https://example.com/api/student/tasks/3/experiment");
                    (request as Request & { params: Record<string, string> }).params = { id: "3" };
                    const response = await module[route].GET!(request);
                    const conflict = changed && (status === "submitted" || status === "graded");
                    expect(response.status).toBe(conflict ? 409 : 200);
                    const body = await response.json() as any;
                    if (conflict) expect(body.error.code).toBe("SOURCE_CONFLICT");
                    else if (route === "experimentRoutes") expect(body.data.samplingResults.simple.data[0].weight).toBe(changed ? 9 : 4);
                    else expect(body.data.numeric.weight.methods.simple.estimate).toBe(changed ? 6 : 3.5);
                }
            }
        }
    } finally { await Bun.file(absolute).delete().catch(() => undefined); }
});

test("population-backed routes return READ_FAILED when population storage is unreadable", async () => {
    const missingPath = `/storage/missing-${crypto.randomUUID()}.xlsx`;
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
        const compact = record({
            samplingResults: { simple: { completed: true, sampleCount: 1, indices: [0], serverGenerated: true } },
        });
        const experimentLoad = await load(compact, [[{ id: 9 }]], { numeric: ["weight"] }, missingPath);
        const experimentRequest = new Request("https://example.com/api/student/tasks/3/experiment");
        (experimentRequest as Request & { params?: Record<string, string> }).params = { id: "3" };
        const experimentResponse = await experimentLoad.module.experimentRoutes.GET!(experimentRequest);
        expect(experimentResponse.status).toBe(500);
        expect(await experimentResponse.json()).toMatchObject({ error: { code: "READ_FAILED" } });

        const statsLoad = await load(record(), [[{ id: 9 }]], { numeric: ["weight"] }, missingPath);
        const statsResponse = await statsLoad.module.statsRoutes.GET!(routeRequest(
            "/api/student/tasks/3/stats",
            undefined,
            { id: "3" },
        ));
        expect(statsResponse.status).toBe(500);
        expect(await statsResponse.json()).toMatchObject({ error: { code: "READ_FAILED" } });

        const samplingLoad = await load(record(), [[{ id: 9 }]], { numeric: ["weight"] }, missingPath);
        const samplingResponse = await samplingLoad.module.samplingActionRoutes.POST!(routeRequest(
            "/api/student/tasks/3/sampling",
            { method: "simple", params: { sampleSize: 2 } },
            { id: "3" },
        ));
        expect(samplingResponse.status).toBe(500);
        expect(await samplingResponse.json()).toMatchObject({ error: { code: "READ_FAILED" } });

        const completionLoad = await load(record(), [[{ id: 9 }]], { numeric: [], stratified: ["gender"] }, missingPath);
        const completionResponse = await completionLoad.module.stageCompleteRoutes.POST!(routeRequest(
            "/api/student/tasks/3/experiment/stages/4/complete",
            { observedVersion: 6 },
            { id: "3", stage: "4" },
        ));
        expect(completionResponse.status).toBe(500);
        expect(await completionResponse.json()).toMatchObject({ error: { code: "READ_FAILED" } });

        const analysisLoad = await load(record(), [[{ id: 9 }]], { numeric: ["weight"] }, missingPath);
        const analysisResponse = await analysisLoad.module.analysisMetricsRoutes.GET!(routeRequest(
            "/api/student/tasks/3/analysis-metrics",
            undefined,
            { id: "3" },
        ));
        expect(analysisResponse.status).toBe(500);
        expect(await analysisResponse.json()).toMatchObject({ error: { code: "READ_FAILED" } });
    } finally {
        console.error = originalConsoleError;
    }
});

test("stage completion ignores client results and does not rewrite stored authoritative methods", async () => {
    const stored = {
        simple: { completed: true, sampleCount: 2, serverGenerated: true, data: [{ id: 1 }, { id: 2 }] },
        systematic: { completed: true, sampleCount: 2, serverGenerated: true, data: [{ id: 1 }, { id: 3 }] },
        pps: { completed: true, sampleCount: 2, serverGenerated: true, data: [{ id: 3 }, { id: 4 }] },
        stratified: {
            completed: true,
            sampleCount: 2,
            serverGenerated: true,
            layers: [{ name: "A", sampleCount: 1 }, { name: "B", sampleCount: 1 }],
            data: [{ id: 1 }, { id: 4 }],
        },
    };
    const q = validQuestionnaire();
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 4, finalSampleSize: 2 };
    const current = record({
        samplingResults: stored,
        wavesData: [{
            waveNumber: 2,
            kind: "main",
            label: "Wave 2",
            questionnaire: q,
            samplePlan: plan,
            samplingResults: stored,
            fieldwork: fieldworkFor(["simple", "systematic", "pps", "stratified"]),
            cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
            completedAt: null,
        }],
    });
    const updated = { ...current, wavesData: [], samplingResults: stored, currentStage: 5, version: 7, stage4CompletedAt: new Date() };
    const { module, operations } = await load(current, [[updated]], { numeric: [], stratified: ["gender"] });
    const response = await module.stageCompleteRoutes.POST!(routeRequest(
        "/api/student/tasks/3/experiment/stages/4/complete",
        { observedVersion: 6, samplingResults: { pps: { unavailable: true } } },
        { id: "3", stage: "4" },
    ));

    expect(response.status).toBe(200);
    const update = operations.find((operation) => operation.kind === "update");
    expect((update?.set as { samplingResults?: Record<string, Record<string, unknown>> }).samplingResults?.pps?.completed).toBe(true);
    expect((update?.set as { samplingResults?: Record<string, Record<string, unknown>> }).samplingResults?.pps?.unavailable).toBeUndefined();
    expect(update?.set).toMatchObject({ version: 7, currentStage: 5 });
    expect(update?.set).not.toHaveProperty("samplingGeneration");
});

test("first experiment entry returns 404 NOT_FOUND instead of 500 when the parent task or student is concurrently deleted before insert", async () => {
    const { db, operations } = createMockDb({
        // 1st select: loadOwnedExperiment -> []; 2nd select: workflow load -> [];
        // 3rd select: student FOR SHARE -> [{ id: 2 }]; 4th select: task FOR SHARE -> [] (deleted!)
        select: [[], [], [{ id: 2 }], []],
    });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock({
        requireAuth: async () => ({ student: { id: 2, studentId: "S001", name: "学生一", classId: 7 }, error: null }),
    }));
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    mock.module("../experiment/task-info", () => ({
        findStudentTaskPopulationSize: async () => 4,
        findStudentTaskSamplingInfo: async () => ({ excelFilePath: populationPath, fieldMapping: {} }),
        findStudentTaskSchedule: async () => ({ openTime: null, deadline: new Date(Date.now() + 60_000) }),
        findStudentTaskSubmitInfo: async () => null,
        findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
    }));

    const module = await import(`./experiment.ts?concurrent-delete=${crypto.randomUUID()}`);
    const request = new Request("https://example.com/api/student/tasks/3/experiment");
    (request as Request & { params?: Record<string, string> }).params = { id: "3" };

    const response = await module.experimentRoutes.GET!(request);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
        success: false,
        error: { code: "NOT_FOUND", message: "任务不存在" },
    });
    expect(operations.some((op) => op.kind === "insert")).toBe(false);
});
