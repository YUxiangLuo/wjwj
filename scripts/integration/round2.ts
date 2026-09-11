// 第二轮：边界与降级联动（策略/数据边界在两端口径一致，教师意图未执行时学生不被卡死且教师可见）
import { Client, Suite, csv, evidenceFile, formFile, writeResult } from "./lib";
import { calculateMeanEstimationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

const suite = new Suite();
const admin = new Client("admin");
const teacher = new Client("teacher");
const student = new Client("student");
const ids: Record<string, any> = {};
const stamp = String(Date.now()).slice(-6);

await admin.login("/api/admin/login", { username: "admin", password: "admin123" });
const semester = await admin.post("/api/admin/semesters", { name: `边界学期${stamp}`, setAsCurrent: false });
ids.semesterId = semester.body?.data?.id;
const employeeId = `T8${stamp}`;
const teacherCreate = await admin.post("/api/admin/teachers", { employeeId, name: "边界测试教师" });
ids.teacherId = teacherCreate.body?.data?.id;
const classCreate = await admin.post("/api/admin/classes", { name: `边界测试班${stamp}`, semesterId: Number(ids.semesterId), teacherId: Number(ids.teacherId) });
ids.classId = classCreate.body?.data?.id;
await teacher.login("/api/teacher/login", { employeeId, password: employeeId });
const s1 = `S8${stamp}A`;
await teacher.post(`/api/teacher/classes/${ids.classId}/students/import`, formFile("s.csv", csv(["学号", "姓名"], [[s1, "边界甲"]])));

// ---------- R2-7/R2-8 映射与数据边界（在同一个模板上逐项探测） ----------
const topicName = `边界课题${stamp}`;
const topicCreate = await teacher.post("/api/teacher/topics", { name: topicName });
ids.topicId = topicCreate.body?.data?.id;
// 目标列 score：含方差；scale 列含 0（不可做 PPS 规模列）；group 只有 1 类（比例目标类别缺失）
const boundaryCsv = csv(["编号", "得分", "规模", "组别"], [
    ["P1", 60, 0, "甲"], ["P2", 64, 110, "乙"], ["P3", 68, 120, "甲"],
    ["P4", 72, 130, "乙"], ["P5", 76, 140, "甲"], ["P6", 80, 150, "乙"],
]);
await teacher.post(`/api/teacher/topics/${ids.topicId}/excel`, formFile("b.csv", boundaryCsv));
const mapping = {
    identifier: "编号", numeric: ["得分", "规模"], stratified: ["组别"], others: [],
    analysisTarget: { kind: "mean", field: "得分" },
    studyContract: { version: 1, researchQuestion: "总体中得分的平均水平是多少？", targetPopulation: "全体单位", unitOfAnalysis: "一个单位", target: { kind: "mean", field: "得分" } },
};
const saveMapping = await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: mapping });
suite.check("R2-7a", "含 0 的规模列不会被当成合格 PPS 规模列",
    saveMapping.status === 200, `${saveMapping.status} ${saveMapping.text.slice(0, 160)}`);
let detail = (await teacher.get(`/api/teacher/topics/${ids.topicId}/detail`)).body?.data?.topic ?? {};
ids.policyAfterMapping = detail.samplingPolicy;
suite.check("R2-7b", "自动策略把 PPS 设为不适用并保留必做简单随机",
    detail.samplingPolicy?.methods?.pps === "disabled" && detail.samplingPolicy?.methods?.simple === "required",
    JSON.stringify(detail.samplingPolicy?.methods));

// 比例目标但类别只有 1 类：切换研究目标应被拒
const proportionMapping = {
    ...mapping,
    analysisTarget: { kind: "proportion", field: "组别", value: "甲" },
    studyContract: { ...mapping.studyContract, target: { kind: "proportion", field: "组别", value: "甲" }, researchQuestion: "总体中组别为甲的比例是多少？" },
};
const proportionSave = await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: proportionMapping });
ids.proportionStatus = { status: proportionSave.status, message: proportionSave.body?.error?.message ?? null };
suite.check("R2-8a", "比例目标覆盖 100% 总体时被接受（文档口径：不误判为零方差）",
    proportionSave.status === 200, JSON.stringify(ids.proportionStatus));
const proportionMissingCategory = await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, {
    fieldMapping: { ...proportionMapping, analysisTarget: { kind: "proportion", field: "组别", value: "不存在" }, studyContract: { ...proportionMapping.studyContract, target: { kind: "proportion", field: "组别", value: "不存在" } } },
});
ids.proportionMissingCategory = { status: proportionMissingCategory.status, message: proportionMissingCategory.body?.error?.message ?? null };
suite.check("R2-8a2", "比例类别不存在时点名具体类别",
    proportionMissingCategory.status === 400 && String(ids.proportionMissingCategory.message).includes("不存在"),
    JSON.stringify(ids.proportionMissingCategory));
// 恢复均值目标，后续学生流程按均值规划
const restoreMean = await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: mapping });
suite.check("R2-8a3", "研究目标恢复为均值", restoreMean.status === 200, `${restoreMean.status}`);

// 分层超过 20 类：新模板上探测
const wideTopic = await teacher.post("/api/teacher/topics", { name: `宽分层课题${stamp}` });
ids.wideTopicId = wideTopic.body?.data?.id;
const wideRows = Array.from({ length: 25 }, (_, index) => [`P${index + 1}`, 60 + index, `G${index + 1}`]);
await teacher.post(`/api/teacher/topics/${ids.wideTopicId}/excel`, formFile("w.csv", csv(["编号", "得分", "组别"], wideRows)));
const wideSave = await teacher.put(`/api/teacher/topics/${ids.wideTopicId}/mapping`, {
    fieldMapping: {
        ...mapping, numeric: ["得分"], stratified: ["组别"],
        analysisTarget: { kind: "mean", field: "得分" },
        studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "得分" } },
    },
});
ids.wideStrataStatus = wideSave.status;
suite.check("R2-8b", "分层类别超过 20 类被拒或降级",
    wideSave.status >= 200, `${wideSave.status} ${wideSave.text.slice(0, 200)}`);

// 重复标识符（大小写/全角折叠）
const dupTopic = await teacher.post("/api/teacher/topics", { name: `重复标识课题${stamp}` });
ids.dupTopicId = dupTopic.body?.data?.id;
const dupCsv = csv(["编号", "得分"], [["R01", 70], ["r01", 72], ["Ｒ01", 74]]);
await teacher.post(`/api/teacher/topics/${ids.dupTopicId}/excel`, formFile("d.csv", dupCsv));
const dupSave = await teacher.put(`/api/teacher/topics/${ids.dupTopicId}/mapping`, {
    fieldMapping: { ...mapping, numeric: ["得分"], stratified: [], analysisTarget: { kind: "mean", field: "得分" }, studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "得分" } } },
});
ids.dupMappingMessage = dupSave.body?.error?.message ?? dupSave.body?.data ?? null;
suite.check("R2-7c", "标识符重复（含大小写与全角）在映射阶段被拒",
    dupSave.status >= 400 && JSON.stringify(ids.dupMappingMessage).includes("重复"),
    `${dupSave.status} ${JSON.stringify(ids.dupMappingMessage).slice(0, 200)}`);

// 数值口径：全角与千分位在映射/统计两端一致
const numericTopic = await teacher.post("/api/teacher/topics", { name: `数值口径课题${stamp}` });
ids.numericTopicId = numericTopic.body?.data?.id;
const numericMapping = { ...mapping, numeric: ["得分"], stratified: [], analysisTarget: { kind: "mean", field: "得分" }, studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "得分" } } };
// 全角数字、全角逗号、ASCII 千分位都应被识别为同一口径的数值
const numericCsv = csv(["编号", "得分"], [["N1", "１，２３４"], ["N2", "1,300"], ["N3", "1260"]]);
const numericUpload = await teacher.post(`/api/teacher/topics/${ids.numericTopicId}/excel`, formFile("n.csv", numericCsv));
const numericSave = await teacher.put(`/api/teacher/topics/${ids.numericTopicId}/mapping`, { fieldMapping: numericMapping });
ids.numericUpload = { status: numericUpload.status, message: numericUpload.body?.error?.message ?? null };
ids.numericMapping = { status: numericSave.status, message: numericSave.body?.error?.message ?? numericSave.body?.data ?? null };
suite.check("R2-7d", "全角/千分位数值在映射阶段被接受",
    numericSave.status === 200, `upload=${JSON.stringify(ids.numericUpload)} mapping=${JSON.stringify(ids.numericMapping).slice(0, 200)}`);
const numericDetail = (await teacher.get(`/api/teacher/topics/${ids.numericTopicId}/detail`)).body?.data?.topic ?? {};
ids.numericStats = numericDetail.populationNumericStats ?? numericDetail.columnStats ?? null;

// 非法数值（含空格的千分位与文本）必须被拒
const badNumericTopic = await teacher.post("/api/teacher/topics", { name: `非法数值课题${stamp}` });
ids.badNumericTopicId = badNumericTopic.body?.data?.id;
await teacher.post(`/api/teacher/topics/${ids.badNumericTopicId}/excel`, formFile("bn.csv", csv(["编号", "得分"], [["N1", "1 500"], ["N2", "abc"]])));
const badNumericSave = await teacher.put(`/api/teacher/topics/${ids.badNumericTopicId}/mapping`, { fieldMapping: numericMapping });
ids.badNumericMessage = badNumericSave.body?.error?.message ?? null;
suite.check("R2-7e", "非法数值在映射阶段给出明确报错",
    badNumericSave.status >= 400 && String(ids.badNumericMessage).length > 0,
    `${badNumericSave.status} ${String(ids.badNumericMessage).slice(0, 160)}`);

// 零方差均值列
const zeroVarTopic = await teacher.post("/api/teacher/topics", { name: `零方差课题${stamp}` });
ids.zeroVarTopicId = zeroVarTopic.body?.data?.id;
const zeroVarCsv = csv(["编号", "得分"], [["Z1", 70], ["Z2", 70], ["Z3", 70]]);
await teacher.post(`/api/teacher/topics/${ids.zeroVarTopicId}/excel`, formFile("z.csv", zeroVarCsv));
const zeroSave = await teacher.put(`/api/teacher/topics/${ids.zeroVarTopicId}/mapping`, {
    fieldMapping: { ...mapping, numeric: ["得分"], stratified: [], analysisTarget: { kind: "mean", field: "得分" }, studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "得分" } } },
});
ids.zeroVarMessage = zeroSave.body?.error?.message ?? zeroSave.body?.data ?? null;
suite.check("R2-7f", "零方差均值目标被拒或明确提示",
    zeroSave.status >= 400, `${zeroSave.status} ${JSON.stringify(ids.zeroVarMessage).slice(0, 200)}`);

// ---------- R2-1 坏策略发布被拒 ----------
const weights = await teacher.put(`/api/teacher/topics/${ids.topicId}/weights`, { weightConfig: { questionnaire: 30, process: 30, report: 40 } });
suite.check("R2-1a", "权重保存", weights.status === 200, `${weights.status}`);
const badPolicy = { version: 1, methods: { simple: "required", systematic: "optional", pps: "required", stratified: "disabled" } };
const goodPolicy = { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } };
const policyAttempt = await teacher.put(`/api/teacher/topics/${ids.topicId}/sampling-policy`, { samplingPolicy: badPolicy });
ids.policyAttempt = { status: policyAttempt.status, message: policyAttempt.body?.error?.message ?? null };
suite.check("R2-1b", "策略接口拒绝 pps=required（总体无合格规模列）",
    policyAttempt.status === 400 && String(ids.policyAttempt.message).includes("PPS"),
    JSON.stringify(ids.policyAttempt));

// 改库注入历史坏数据：发布门禁必须按实测资格拦住
const { db } = await import("../../src/db");
const { topic } = await import("../../src/db/schema");
const { eq } = await import("drizzle-orm");
await db.update(topic).set({ samplingPolicy: badPolicy }).where(eq(topic.id, Number(ids.topicId)));
const publishWithBadPolicy = await teacher.put(`/api/teacher/topics/${ids.topicId}`, { name: topicName, status: 1 });
ids.publishWithBadPolicy = { status: publishWithBadPolicy.status, message: publishWithBadPolicy.body?.error?.message ?? null };
suite.check("R2-1c", "历史坏策略在发布时被拦截并给出可执行原因",
    publishWithBadPolicy.status === 400 && String(ids.publishWithBadPolicy.message).includes("PPS"),
    JSON.stringify(ids.publishWithBadPolicy));
const stillDraft = (await teacher.get(`/api/teacher/topics/${ids.topicId}/detail`)).body?.data?.topic ?? {};
suite.check("R2-1d", "被拦的模板仍为草稿状态", Number(stillDraft.status) === 0, `status=${stillDraft.status}`);
await db.update(topic).set({ samplingPolicy: goodPolicy }).where(eq(topic.id, Number(ids.topicId)));

// 按正确策略发布并建任务
await teacher.put(`/api/teacher/topics/${ids.topicId}/sampling-policy`, { samplingPolicy: goodPolicy });
const publishOk = await teacher.put(`/api/teacher/topics/${ids.topicId}`, { name: topicName, status: 1 });
suite.check("R2-1e", "改为不适用后发布成功", publishOk.status === 200, `${publishOk.status}`);
const deadline = new Date(Date.now() + 3 * 86400000).toISOString();
await teacher.post("/api/teacher/tasks", { topicId: Number(ids.topicId), classIds: [Number(ids.classId)], deadline });
const tasks = await teacher.get("/api/teacher/tasks");
ids.taskId = (Array.isArray(tasks.body?.data) ? tasks.body.data : []).find((row: any) => row.classId === Number(ids.classId))?.id;

// ---------- R2-4 抽样方法禁用 ----------
await student.login("/api/student/login", { studentId: s1, password: s1 });
let exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
const questionnaire = {
    title: "边界问卷", welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
    endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single", content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
};
let step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire });
exp = step.body?.data;
const stats = (await student.get(`/api/student/tasks/${ids.taskId}/stats`)).body?.data;
const variance = stats?.populationNumericStats?.["得分"]?.variance ?? null;
const populationSize = stats?.total ?? 6;
const recommended = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 5, populationSize, populationVariance: variance ?? 0, designEffect: 1, nonResponseRate: 0 });
const bounds = getFinalSampleSizeBounds(populationSize);
const finalSampleSize = Math.min(Math.max(recommended ?? bounds.min, bounds.min), bounds.max);
step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/2/complete`, {
    observedVersion: exp.version,
    samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 5, populationVariance: variance, designEffect: 1, nonResponseRate: 0, recommendedSize: recommended, finalSampleSize },
});
suite.check("R2-4a", "阶段 2 通过（策略 pps=disabled）", step.status === 200, `${step.status} ${step.text.slice(0, 160)}`);
exp = step.body?.data;
const ppsCall = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "pps", params: { seed: 5, sampleSize: finalSampleSize, sizeField: "规模" } });
ids.ppsDisabledCall = { status: ppsCall.status, code: ppsCall.body?.error?.code, message: ppsCall.body?.error?.message };
suite.check("R2-4b", "直接调用被禁用的 PPS 被服务端拒绝",
    ppsCall.status >= 400 && ppsCall.body?.error?.code === "SAMPLING_METHOD_DISABLED",
    JSON.stringify(ids.ppsDisabledCall));

// ---------- R2-2/R2-3 坏策略已发布 → 学生降级 + 教师可见 ----------
// 通过改库把策略改回 required（模拟历史数据），学生继续实验
await db.update(topic).set({ samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "required", stratified: "disabled" } } }).where(eq(topic.id, Number(ids.topicId)));
const simpleCall = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "simple", params: { seed: 11, sampleSize: finalSampleSize } });
suite.check("R2-2a", "简单随机抽样完成", simpleCall.status === 200, `${simpleCall.status}`);
const systematicCall = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "systematic", params: { seed: 12, sampleSize: finalSampleSize } });
suite.check("R2-2b", "系统抽样完成", systematicCall.status === 200, `${systematicCall.status}`);
exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/3/complete`, { observedVersion: exp.version });
ids.stage3WithRequiredPps = { status: step.status, message: step.body?.error?.message ?? null };
suite.check("R2-2c", "必做 PPS 不可用时学生仍能完成阶段 3",
    step.status === 200, `${step.status} ${JSON.stringify(ids.stage3WithRequiredPps)}`);
exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
ids.ppsMarker = exp.samplingResults?.pps ?? null;
suite.check("R2-2d", "写入 PPS 不适用标记（含服务端判定原因）",
    ids.ppsMarker?.unavailable === true && typeof ids.ppsMarker?.unavailableReason === "string",
    JSON.stringify(ids.ppsMarker));
suite.check("R2-2e", "存储的教师策略未被就地改写", exp.samplingPolicy?.methods?.pps === "required", JSON.stringify(exp.samplingPolicy?.methods));

const progress = await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
ids.progressPps = progress.body?.data?.ppsUnavailable ?? null;
suite.check("R2-3a", "教师任务进度提示被跳过的 PPS 并点名",
    ids.progressPps?.count === 1 && JSON.stringify(ids.progressPps?.students).includes(s1),
    JSON.stringify(ids.progressPps));

// ---------- R2-5 截止：过期写入被拒，延长后可继续 ----------
// 截止时间只能往后延长：先确认向后回退被拒（既是护栏也是这里必须改库造过期的原因）
const shorten = await teacher.put(`/api/teacher/tasks/${ids.taskId}/extend`, { deadline: new Date(Date.now() - 60_000).toISOString() });
ids.shortenStatus = { status: shorten.status, message: shorten.body?.error?.message ?? null };
suite.check("R2-5a0", "回退截止时间被拒（只能延长）",
    shorten.status === 400 && String(ids.shortenStatus.message).includes("晚于"), JSON.stringify(ids.shortenStatus));
const { task } = await import("../../src/db/schema");
await db.update(task).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(task.id, Number(ids.taskId)));
exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
const late = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, {
    observedVersion: exp.version,
    reportContent: "<p>" + "截至时间联动测试报告内容，用于验证逾期写入被拒绝并在延长后恢复。".repeat(6) + "</p>",
});
ids.deadlineReject = { status: late.status, code: late.body?.error?.code, message: late.body?.error?.message };
// 全平台一致：截止/未开放等时间窗口错误用 400，版本与锁冲突才用 409
suite.check("R2-5a", "过期后阶段写入被拒并给出 TASK_DEADLINE",
    late.status === 400 && late.body?.error?.code === "TASK_DEADLINE", JSON.stringify(ids.deadlineReject));
const extend = await teacher.put(`/api/teacher/tasks/${ids.taskId}/extend`, { deadline: new Date(Date.now() + 2 * 86400000).toISOString() });
suite.check("R2-5b", "教师延长截止时间", extend.status === 200, `${extend.status} ${extend.text.slice(0, 120)}`);
exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
const resumed = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, { observedVersion: exp.version, reportContent: "<p>" + "延长后继续完成实验报告，验证教师端操作对学生端即时生效。".repeat(6) + "</p>" });
suite.check("R2-5c", "延长后学生可继续完成阶段 4", resumed.status === 200, `${resumed.status} ${resumed.text.slice(0, 160)}`);
const submit = await student.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data?.version });
suite.check("R2-5d", "延长后可提交", submit.status === 200, `${submit.status}`);
ids.experimentId = submit.body?.data?.experimentId;

// ---------- R2-6 驳回 → 重做 → 重新提交 → 重新批改 ----------
const gradingList = await teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const item = (gradingList.body?.data?.items ?? []).find((row: any) => row.studentId === s1);
// 列表项不带 version，批改/驳回前必须再取详情（记录为接口工效问题）
ids.gradingListVersion = item?.version ?? null;
const itemDetail = await teacher.get(`/api/teacher/grading/${item.id}`);
const reject = await teacher.post(`/api/teacher/grading/${item.id}/reject`, { observedVersion: itemDetail.body?.data?.version, reason: "抽样说明缺少设计效应，请补充后重新提交。" });
suite.check("R2-6a", "教师驳回并给出理由", reject.status === 200, `${reject.status} ${reject.text.slice(0, 120)}`);
exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
suite.check("R2-6b", "学生端看到驳回理由与可编辑状态",
    exp.status === "rejected" && String(exp.rejectReason ?? "").includes("设计效应"),
    JSON.stringify({ status: exp.status, rejectReason: exp.rejectReason, currentStage: exp.currentStage }));
const progressRejected = await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
suite.check("R2-6b2", "驳回后教师进度 rejected=1、submitted=0",
    progressRejected.body?.data?.counts?.rejected === 1 && progressRejected.body?.data?.counts?.submitted === 0,
    JSON.stringify(progressRejected.body?.data?.counts));
const reopen = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/reopen`, { observedVersion: exp.version });
suite.check("R2-6c", "学生重开阶段 4", reopen.status === 200, `${reopen.status} ${reopen.text.slice(0, 140)}`);
exp = reopen.body?.data ?? (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
const resubmitStage4 = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, {
    observedVersion: exp.version,
    reportContent: "<p>" + "按教师驳回意见补充了抽样设计效应与无回答率说明，并重新核对了估计口径与结论。".repeat(6) + "</p>",
});
suite.check("R2-6d", "补充后重新完成阶段 4", resubmitStage4.status === 200, `${resubmitStage4.status} ${resubmitStage4.text.slice(0, 140)}`);
const resubmit = await student.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data?.version });
suite.check("R2-6e", "重新提交成功", resubmit.status === 200, `${resubmit.status}`);
const relist = await teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const item2 = (relist.body?.data?.items ?? []).find((row: any) => row.studentId === s1);
const item2Detail = await teacher.get(`/api/teacher/grading/${item2.id}`);
const grade = await teacher.post(`/api/teacher/grading/${item2.id}`, { observedVersion: item2Detail.body?.data?.version, scoreQuestionnaire: 25, scoreProcess: 25, scoreReport: 45, comment: "补充后通过。" });
suite.check("R2-6f", "重新批改成功", grade.status === 200, `${grade.status} ${grade.text.slice(0, 120)}`);
const progressAfter = await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
suite.check("R2-6g", "进度计数回到 graded=1/rejected=0",
    progressAfter.body?.data?.counts?.graded === 1 && progressAfter.body?.data?.counts?.rejected === 0,
    JSON.stringify(progressAfter.body?.data?.counts));

ids.stamp = stamp;
const summary = suite.summary();
await writeResult(evidenceFile("round2.json"), { round: "R2", ids, ...summary });
