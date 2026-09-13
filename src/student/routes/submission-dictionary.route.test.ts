import { expect, mock, test } from "bun:test";
import { bindingDictionary } from "@/test-utils/question-variable-binding";
import { createMockDb } from "@/test-utils/mock-db";
import { createStudentAuthModuleMock } from "@/test-utils/mock-auth-modules";
const dictionary = bindingDictionary();
const submit = mock(async (_params: any) => ({ ok: true, experimentId: 9 }));
const find = mock(async (_taskId: number, _classId: number) => ({ topicName: "当前任务", populationSize: 60, openTime: null, deadline: null,
    variableDictionary: dictionary, variableDictionaryRevision: dictionary.revision, excelFilePath: "storage/fixture.csv", fieldMapping: { identifier: "id" } }));
const { db } = createMockDb({ select: [[{ id: 9, taskId: 3, version: 7, currentStage: 4, status: "in_progress" }]] });
mock.module("../../db", () => ({ db }));
mock.module("./auth", () => createStudentAuthModuleMock({ requireAuth: async () => ({ error: null, student: { id: 2, classId: 11, studentId: "S001", name: "学生" } }) }));
mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: async () => null }));
const taskInfoModule = await import("../experiment/task-info");
mock.module("../experiment/task-info", () => ({ ...taskInfoModule, findStudentTaskSubmitInfo: find }));
mock.module("../experiment/submit-service", () => ({ submitStudentExperiment: submit }));
const { submitRoutes } = await import("./experiment");
test("HTTP submission forwards both authoritative dictionary and monotone counter into validation/snapshot service", async () => {
    const req = new Request("http://localhost/api/student/tasks/3/submit", { method: "POST", body: JSON.stringify({ observedVersion: 7 }) }) as Request & { params: Record<string, string> };
    req.params = { id: "3" };
    const response = await submitRoutes.POST!(req);
    expect(response.status).toBe(200);
    expect(find).toHaveBeenCalledWith(3, 11);
    expect(submit.mock.calls[0]![0].taskInfo).toMatchObject({ variableDictionary: dictionary, variableDictionaryRevision: 3, excelFilePath: "storage/fixture.csv" });
    expect(submit.mock.calls[0]![0].observedVersion).toBe(7);
});
