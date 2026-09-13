import { beforeEach, expect, mock, test } from "bun:test";
import { bindingDictionary } from "@/test-utils/question-variable-binding";
let authError: Response | null = null, accessError: Response | null = null;
let openTime: Date | null = null;
const read = mock(async (_taskId: number, _classId: number): Promise<any> => ({ ok: true, dictionary: bindingDictionary() }));
mock.module("./auth", () => ({ requireAuth: async () => ({ error: authError, student: authError ? null : { id: 2, classId: 11 } }) }));
mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: async () => accessError }));
mock.module("../experiment/task-info", () => ({ findStudentTaskSchedule: async () => ({ openTime, deadline: null }) }));
mock.module("../experiment/variable-dictionary", () => ({ readStudentVariableDictionary: read }));
const { studentVariableDictionaryRoutes } = await import("./variable-dictionary");
function request(id = "3") { const req = new Request("http://localhost/api/student/tasks/3/variables") as Request & { params: Record<string, string> }; req.params = { id }; return req; }
beforeEach(() => { authError = null; accessError = null; openTime = null; read.mockClear(); });
test("student dictionary route authenticates and scopes the source read", async () => {
    const res = await studentVariableDictionaryRoutes.GET!(request());
    expect(res.status).toBe(200); expect(read).toHaveBeenCalledWith(3, 11);
    expect((await res.json()).data.dictionary.revision).toBe(3);
});
test("unauthenticated/other-class requests cannot reach dictionary source access", async () => {
    authError = new Response(null, { status: 401 }); expect((await studentVariableDictionaryRoutes.GET!(request())).status).toBe(401);
    authError = null; accessError = new Response(null, { status: 404 }); expect((await studentVariableDictionaryRoutes.GET!(request())).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
});
test("unopened tasks and invalid IDs do not expose metadata", async () => {
    openTime = new Date(Date.now() + 86_400_000);
    const future = await studentVariableDictionaryRoutes.GET!(request());
    expect(future.status).toBe(400); expect((await future.json()).error.code).toBe("TASK_NOT_OPEN");
    expect((await studentVariableDictionaryRoutes.GET!(request("x"))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
});
test("source errors keep their fail-closed response and do not become empty success", async () => {
    read.mockResolvedValueOnce({ ok: false, code: "DATASET_CHANGED", message: "来源变化", status: 409 });
    const res = await studentVariableDictionaryRoutes.GET!(request()); expect(res.status).toBe(409); expect((await res.json()).error.code).toBe("DATASET_CHANGED");
});
