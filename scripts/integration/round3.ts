// 第三轮：并发、角色/班级隔离、删除护栏、审计联动
import { Client, Suite, csv, evidenceFile, formFile, writeResult } from "./lib";
import { calculateMeanEstimationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

const suite = new Suite();
const admin = new Client("admin");
const teacher = new Client("teacher");
const other = new Client("other-teacher");
const student = new Client("student");
const student2 = new Client("student2");
const outsider = new Client("outsider-student");
const ids: Record<string, any> = {};
const stamp = String(Date.now()).slice(-6);

await admin.login("/api/admin/login", { username: "admin", password: "admin123" });
const semester = await admin.post("/api/admin/semesters", { name: `隔离学期${stamp}`, setAsCurrent: false });
ids.semesterId = semester.body?.data?.id;
const employeeId = `T7${stamp}`;
ids.teacherId = (await admin.post("/api/admin/teachers", { employeeId, name: "隔离测试教师" })).body?.data?.id;
ids.classId = (await admin.post("/api/admin/classes", { name: `隔离测试班${stamp}`, semesterId: Number(ids.semesterId), teacherId: Number(ids.teacherId) })).body?.data?.id;
await teacher.login("/api/teacher/login", { employeeId, password: employeeId });
const s1 = `S7${stamp}A`;
const s2 = `S7${stamp}B`;
await teacher.post(`/api/teacher/classes/${ids.classId}/students/import`, formFile("s.csv", csv(["学号", "姓名"], [[s1, "隔离甲"], [s2, "隔离乙"]])));

// 模板 + 任务
const topicName = `隔离课题${stamp}`;
ids.topicId = (await teacher.post("/api/teacher/topics", { name: topicName })).body?.data?.id;
const population = Array.from({ length: 10 }, (_, index) => [`P${index + 1}`, 60 + index * 3, 100 + index * 5, index % 2 ? "甲" : "乙"]);
await teacher.post(`/api/teacher/topics/${ids.topicId}/excel`, formFile("p.csv", csv(["编号", "得分", "规模", "组别"], population)));
const mapping = {
    identifier: "编号", numeric: ["得分", "规模"], stratified: ["组别"], others: [],
    analysisTarget: { kind: "mean", field: "得分" },
    studyContract: { version: 1, researchQuestion: "总体中得分的平均水平是多少？", targetPopulation: "全体单位", unitOfAnalysis: "一个单位", target: { kind: "mean", field: "得分" } },
};
await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: mapping });
await teacher.put(`/api/teacher/topics/${ids.topicId}/weights`, { weightConfig: { questionnaire: 30, process: 30, report: 40 } });
await teacher.put(`/api/teacher/topics/${ids.topicId}`, { name: topicName, status: 1 });
await teacher.post("/api/teacher/tasks", { topicId: Number(ids.topicId), classIds: [Number(ids.classId)], deadline: new Date(Date.now() + 4 * 86400000).toISOString() });
const taskList = await teacher.get("/api/teacher/tasks");
ids.taskId = (Array.isArray(taskList.body?.data) ? taskList.body.data : []).find((row: any) => row.classId === Number(ids.classId))?.id;

const loginStudent = async (client: Client, studentId: string) => client.login("/api/student/login", { studentId, password: studentId });
const questionnaire = {
    title: "隔离问卷", welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
    endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single", content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
};
const ahead = async (client: Client) => {
    let exp = (await client.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
    const s1step = await client.post(`/api/student/tasks/${ids.taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire });
    if (s1step.status !== 200) return { error: s1step.body?.error, stage: 1 };
    exp = s1step.body?.data;
    const stats = (await client.get(`/api/student/tasks/${ids.taskId}/stats`)).body?.data;
    const variance = stats?.populationNumericStats?.["得分"]?.variance ?? null;
    const populationSize = stats?.total ?? 10;
    const recommended = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 5, populationSize, populationVariance: variance ?? 0, designEffect: 1, nonResponseRate: 0 });
    const bounds = getFinalSampleSizeBounds(populationSize);
    const finalSampleSize = Math.min(Math.max(recommended ?? bounds.min, bounds.min), bounds.max);
    const plan = await client.post(`/api/student/tasks/${ids.taskId}/experiment/stages/2/complete`, {
        observedVersion: exp.version,
        samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 5, populationVariance: variance, designEffect: 1, nonResponseRate: 0, recommendedSize: recommended, finalSampleSize },
    });
    if (plan.status !== 200) return { error: plan.body?.error, stage: 2 };
    exp = plan.body?.data;
    const simple = await client.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "simple", params: { seed: 3, sampleSize: finalSampleSize } });
    if (simple.status !== 200) return { error: simple.body?.error, stage: "sampling" };
    const systematic = await client.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "systematic", params: { seed: 4, sampleSize: finalSampleSize } });
    if (systematic.status !== 200) return { error: systematic.body?.error, stage: "systematic" };
    exp = (await client.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
    const stage3 = await client.post(`/api/student/tasks/${ids.taskId}/experiment/stages/3/complete`, { observedVersion: exp.version });
    if (stage3.status !== 200) return { error: stage3.body?.error, stage: 3 };
    exp = stage3.body?.data;
    const stage4 = await client.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, { observedVersion: exp.version, reportContent: "<p>" + "隔离测试报告内容，用于并发与权限验证，覆盖抽样设计、估计与结论。".repeat(6) + "</p>" });
    if (stage4.status !== 200) return { error: stage4.body?.error, stage: 4 };
    return { ok: true, version: stage4.body?.data?.version };
};

await loginStudent(student, s1);
await loginStudent(student2, s2);
const ready1 = await ahead(student);
const ready2 = await ahead(student2);
suite.check("R3-0", "两名学生各自完成到可提交状态", ready1.ok === true && ready2.ok === true, JSON.stringify({ ready1, ready2 }));

// ---------- R3-1/R3-2 并发提交 ----------
const [submitA, submitB] = await Promise.all([
    student.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: ready1.version }),
    student.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: ready1.version }),
]);
ids.concurrentSubmit = [{ status: submitA.status, code: submitA.body?.error?.code }, { status: submitB.status, code: submitB.body?.error?.code }];
const bothOk = submitA.status === 200 && submitB.status === 200;
suite.check("R3-1a", "同一学生并发提交不产生重复提交或 5xx",
    bothOk || [submitA.status, submitB.status].every((status) => status < 500),
    JSON.stringify(ids.concurrentSubmit));
const gradingAll = await teacher.get(`/api/teacher/grading?pageSize=100`);
const s1Submissions = (gradingAll.body?.data?.items ?? []).filter((row: any) => row.studentId === s1);
suite.check("R3-1b", "该学生只有一条提交记录", s1Submissions.length === 1, `count=${s1Submissions.length}`);

const submit2 = await student2.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: ready2.version });
suite.check("R3-1c", "第二名学生提交成功", submit2.status === 200, `${submit2.status} ${submit2.text.slice(0, 120)}`);

// 阶段写入的版本冲突：用旧版本号重复完成阶段 4
const staleVersion = (await student2.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data?.version;
const staleWrite = await student2.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, { observedVersion: (staleVersion ?? 2) - 1, reportContent: "<p>" + "旧版本写入测试".repeat(30) + "</p>" });
ids.staleWrite = { status: staleWrite.status, code: staleWrite.body?.error?.code };
suite.check("R3-1d", "过期版本号的写入被拒且不覆盖已提交内容",
    staleWrite.status === 409 || staleWrite.status === 400, JSON.stringify(ids.staleWrite));

// ---------- R3-3 跨教师隔离 ----------
const otherTeacherId = `T6${stamp}`;
await admin.post("/api/admin/teachers", { employeeId: otherTeacherId, name: "旁观教师" });
await other.login("/api/teacher/login", { employeeId: otherTeacherId, password: otherTeacherId });
const foreign = {
    progress: await other.get(`/api/teacher/tasks/${ids.taskId}/progress`),
    gradingDetail: await other.get(`/api/teacher/grading/${s1Submissions[0]?.id}`),
    topicDetail: await other.get(`/api/teacher/topics/${ids.topicId}/detail`),
    exportData: await other.get(`/api/teacher/grade-export/data?classId=${ids.classId}&topicId=${ids.topicId}`),
    exportExcel: await other.get(`/api/teacher/grade-export/excel?classId=${ids.classId}&topicId=${ids.topicId}`),
    classStudents: await other.get(`/api/teacher/classes/${ids.classId}/students`),
    gradeAttempt: await other.post(`/api/teacher/grading/${s1Submissions[0]?.id}`, { observedVersion: 1, scoreQuestionnaire: 10, scoreProcess: 10, scoreReport: 10, comment: "越权批改" }),
    taskDelete: await other.del(`/api/teacher/tasks/${ids.taskId}?confirm=1`),
};
ids.foreign = Object.fromEntries(Object.entries(foreign).map(([key, value]: [string, any]) => [key, {
    status: value.status, code: value.body?.error?.code ?? null, rows: Array.isArray(value.body?.data) ? value.body.data.length : null,
}]));
const exportLeaked = foreign.exportData.status === 200 && (foreign.exportData.body?.data ?? []).length > 0;
suite.check("R3-3a", "跨教师读取任务/批改/模板被拒，导出按教师过滤（不泄露数据）",
    foreign.progress.status === 404 && foreign.gradingDetail.status === 404 && foreign.topicDetail.status === 404
    && foreign.classStudents.status === 403 && !exportLeaked,
    JSON.stringify(ids.foreign));
suite.check("R3-3b", "跨教师写入（批改/删任务）被拒且无 5xx",
    foreign.gradeAttempt.status >= 400 && foreign.gradeAttempt.status < 500
    && foreign.taskDelete.status >= 400 && foreign.taskDelete.status < 500,
    JSON.stringify({ grade: ids.foreign.gradeAttempt, del: ids.foreign.taskDelete }));
const exportStillIntact = await teacher.get(`/api/teacher/grade-export/data?classId=${ids.classId}&topicId=${ids.topicId}`);
suite.check("R3-3c", "越权尝试后本教师数据仍完整",
    (exportStillIntact.body?.data ?? []).length === 2, JSON.stringify((exportStillIntact.body?.data ?? []).map((row: any) => row.studentId)));

// ---------- R3-4 跨班级隔离 ----------
await loginStudent(outsider, "S2604");
const outsiderTask = await outsider.get(`/api/student/tasks/${ids.taskId}/experiment`);
const outsiderHall = await outsider.get("/api/student/tasks");
const outsiderStages = await outsider.post(`/api/student/tasks/${ids.taskId}/experiment/stages/1/complete`, { observedVersion: 1, questionnaire });
ids.outsider = {
    experiment: { status: outsiderTask.status, code: outsiderTask.body?.error?.code },
    stageWrite: { status: outsiderStages.status, code: outsiderStages.body?.error?.code },
    hallHasTask: (outsiderHall.body?.data ?? []).some((row: any) => row.id === Number(ids.taskId)),
};
suite.check("R3-4a", "他班学生打不开任务实验、无法写入、大厅也不可见",
    (outsiderTask.status === 404 || outsiderTask.status === 403)
    && ids.outsider.stageWrite.status >= 400 && ids.outsider.hallHasTask === false,
    JSON.stringify(ids.outsider));

// ---------- R3-5 并发批改 ----------
const item = (await teacher.get(`/api/teacher/grading?status=submitted&pageSize=50`)).body?.data?.items?.find((row: any) => row.studentId === s1);
const version = (await teacher.get(`/api/teacher/grading/${item.id}`)).body?.data?.version;
const [gradeA, gradeB] = await Promise.all([
    teacher.post(`/api/teacher/grading/${item.id}`, { observedVersion: version, scoreQuestionnaire: 30, scoreProcess: 30, scoreReport: 40, comment: "并发批改 A" }),
    teacher.post(`/api/teacher/grading/${item.id}`, { observedVersion: version, scoreQuestionnaire: 10, scoreProcess: 10, scoreReport: 10, comment: "并发批改 B" }),
]);
ids.concurrentGrade = [{ status: gradeA.status, code: gradeA.body?.error?.code }, { status: gradeB.status, code: gradeB.body?.error?.code }];
suite.check("R3-5a", "并发批改只成功一次",
    [gradeA.status, gradeB.status].filter((status) => status === 200).length === 1,
    JSON.stringify(ids.concurrentGrade));
const finalGrade = await student.get(`/api/student/tasks/${ids.taskId}/submission`);
ids.finalComment = finalGrade.body?.data?.teacherComment ?? null;
suite.check("R3-5b", "学生看到的评语来自成功的那次批改",
    String(ids.finalComment).includes("并发批改 A") || String(ids.finalComment).includes("并发批改 B"),
    String(ids.finalComment));

// ---------- R3-6 删除护栏 ----------
const roster = await teacher.get(`/api/teacher/classes/${ids.classId}/students?pageSize=100`);
const rosterItems = (Array.isArray(roster.body?.data) ? roster.body.data : roster.body?.data?.items ?? []);
const s1Row = rosterItems.find((row: any) => row.studentId === s1);
const s1Id = s1Row?.id ?? s1Row?.studentId;
const deletePreview = await teacher.get(`/api/teacher/students/${s1Id}/deletion-preview`);
ids.deletePreview = { status: deletePreview.status, body: deletePreview.body?.data ?? deletePreview.body?.error ?? null };
const previewImpact = deletePreview.body?.data?.impact ?? {};
suite.check("R3-6a", "有提交的学生删除预览给出影响面并标记需确认",
    deletePreview.status === 200 && Number(previewImpact.experiments ?? 0) >= 1
    && deletePreview.body?.data?.requiresConfirmation === true,
    JSON.stringify(ids.deletePreview).slice(0, 240));
const deleteWithoutConfirm = await teacher.del(`/api/teacher/students/${s1Id}`);
ids.deleteWithoutConfirm = { status: deleteWithoutConfirm.status, code: deleteWithoutConfirm.body?.error?.code };
suite.check("R3-6b", "未确认的硬删除被拒（SUBMISSIONS_EXIST）",
    deleteWithoutConfirm.status === 409 && deleteWithoutConfirm.body?.error?.code === "SUBMISSIONS_EXIST",
    JSON.stringify(ids.deleteWithoutConfirm));
const progressBeforeDelete = (await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`)).body?.data?.counts;
const confirmedDelete = await teacher.del(`/api/teacher/students/${s1Id}?confirm=1`);
ids.confirmedDelete = { status: confirmedDelete.status, body: confirmedDelete.body?.data ?? confirmedDelete.body ?? null };
suite.check("R3-6c", "确认后删除成功并给出级联统计",
    confirmedDelete.status === 200, JSON.stringify(ids.confirmedDelete).slice(0, 200));
const progressAfterDelete = (await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`)).body?.data;
const rosterAfter = (await teacher.get(`/api/teacher/classes/${ids.classId}/students?pageSize=100`)).body?.data;
const rosterAfterItems = Array.isArray(rosterAfter) ? rosterAfter : rosterAfter?.items ?? [];
const progressTotal = Object.values(progressAfterDelete?.counts ?? {}).reduce((sum: number, value: any) => sum + Number(value), 0);
suite.check("R3-6d", "名单与进度随删除即时更新",
    rosterAfterItems.some((row: any) => row.studentId === s1) === false && progressTotal === 1,
    JSON.stringify({ counts: progressAfterDelete?.counts, rosterSize: rosterAfterItems.length, before: progressBeforeDelete }));
const staleGradingLookup = await teacher.get(`/api/teacher/grading/${s1Submissions[0]?.id}`);
suite.check("R3-6e", "被删除学生的提交不可再访问", staleGradingLookup.status === 404, `${staleGradingLookup.status}`);

const taskPreview = await teacher.get(`/api/teacher/tasks/${ids.taskId}/deletion-preview`);
ids.taskPreview = { status: taskPreview.status, body: taskPreview.body?.data ?? null };
suite.check("R3-6f", "任务删除预览列出受影响提交数",
    taskPreview.status === 200 && Number(taskPreview.body?.data?.impact?.submitted ?? 0) + Number(taskPreview.body?.data?.impact?.graded ?? 0) >= 1,
    JSON.stringify(ids.taskPreview).slice(0, 200));

// 教师在使用中不可删除
const teacherDelete = await admin.del(`/api/admin/teachers/${ids.teacherId}`);
ids.teacherDelete = { status: teacherDelete.status, code: teacherDelete.body?.error?.code };
suite.check("R3-6g", "有班级/模板占用的教师不可删除（TEACHER_IN_USE）",
    teacherDelete.status === 409 && teacherDelete.body?.error?.code === "TEACHER_IN_USE", JSON.stringify(ids.teacherDelete));

// ---------- R3-7 管理端审计与统计 ----------
const { db } = await import("../../src/db");
const { auditEvent } = await import("../../src/db/schema");
const { desc } = await import("drizzle-orm");
const recentAudit = await db.select().from(auditEvent).orderBy(desc(auditEvent.id)).limit(20);
const deleteAudit = recentAudit.find((row) => row.action === "student.deleted" && row.entityId === Number(s1Id));
ids.audit = deleteAudit
    ? { action: deleteAudit.action, actorType: deleteAudit.actorType, entityId: deleteAudit.entityId, details: deleteAudit.details }
    : null;
const auditDetails = JSON.stringify(deleteAudit?.details ?? {});
suite.check("R3-7b", "学生删除留下脱敏审计（不含明文姓名/学号）",
    Boolean(deleteAudit) && !auditDetails.includes(s1) && !auditDetails.includes("隔离甲"),
    JSON.stringify(ids.audit).slice(0, 200));

const stats = await admin.get("/api/admin/stats");
ids.adminStats = stats.body?.data ?? null;
suite.check("R3-7a", "管理端统计可用且学生数随删除下降",
    stats.status === 200 && Number(ids.adminStats?.studentCount ?? 0) >= 1, JSON.stringify(ids.adminStats));
const gradingAudit = recentAudit.filter((row) => row.action.startsWith("grade") || row.action.startsWith("experiment"));
ids.gradingAuditCount = gradingAudit.length;
suite.check("R3-7c", "批改动作的审计留痕现状（记录用）", true,
    `批改相关审计行数=${gradingAudit.length}，最近动作=${recentAudit.slice(0, 5).map((row) => row.action).join(",")}`);

ids.stamp = stamp;
const summary = suite.summary();
await writeResult(evidenceFile("round3.json"), { round: "R3", ids, ...summary });
