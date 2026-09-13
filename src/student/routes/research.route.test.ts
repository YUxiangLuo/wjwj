import { beforeEach, expect, mock, test } from "bun:test";
import { handleServerError } from "@/server/http";
import { researchFixture } from "@/test-utils/research-analysis";
const f = researchFixture(); let identity = 2;
const list = mock(async () => f.list), save = mock(async (_params: any) => ({ run: f.run, replayed: false }));
mock.module("../experiment/research-service", () => ({ listResearchRuns: list, saveResearchRun: save }));
mock.module("./auth", () => ({ requireAuth: async () => identity ? { student: { id: identity } } : { error: new Response(null, { status: 401 }) } }));
const { researchRoutes } = await import("./research");
const valid = () => ({ observedVersion: 7, requestKey: `r_${"a".repeat(32)}`, spec: f.run.spec });
function request(data: unknown, method = "POST") { return Object.assign(new Request("http://localhost/api/student/tasks/3/research-analyses", { method, ...(method === "POST" ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}) }), { params: { id: "3" } }); }
beforeEach(() => { identity = 2; list.mockClear(); save.mockClear(); });
for (const change of ["rows", "weights", "result", "version", "key", "spec-version", "spec-extra", "null"] as const) test(`analysis API rejects untrusted ${change} before compute`, async () => {
    const body: any = valid();
    if (["rows", "weights", "result"].includes(change)) body[change] = [];
    if (change === "version") body.observedVersion = "7";
    if (change === "key") body.requestKey = "reuse";
    if (change === "spec-version") body.spec = { ...body.spec, schemaVersion: "1" };
    if (change === "spec-extra") body.spec = { ...body.spec, values: [] };
    const response = await Promise.resolve(researchRoutes.POST!(request(change === "null" ? null : body))).catch(handleServerError);
    expect(response.status).toBe(400); expect(save).not.toHaveBeenCalled();
});
test("authenticated endpoints preserve actor, cancellation and private caching; a changed login cannot authorize persistence", async () => {
    const req = request(valid()); const response = await researchRoutes.POST!(req);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const params = save.mock.calls[0]![0]; expect(params).toMatchObject({ studentId: 2, taskId: 3, observedVersion: 7, spec: f.run.spec }); expect(params.signal).toBe(req.signal);
    await params.authorize(); identity = 99; await expect(params.authorize()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const get = await researchRoutes.GET!(request(null, "GET")); expect(get.headers.get("cache-control")).toBe("private, no-store");
    identity = 0; expect((await researchRoutes.GET!(request(null, "GET"))).status).toBe(401); expect((await researchRoutes.POST!(request(valid()))).status).toBe(401);
});
