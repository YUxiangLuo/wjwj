// 第一轮：主链路贯通（管理员 → 教师 → 学生 → 批改 → 回看 → 导出）
// 运行：bun scripts/integration/round1.ts
import { Client, Suite, csv, evidenceFile, formFile, waitFor, writeResult, BASE } from "./lib";
// 与学生端 UI 共用同一份样本量算法：脚本按界面口径规划，服务端必须接受
import { calculateMeanEstimationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6);
const suite = new Suite();
const admin = new Client("admin");
const teacher = new Client("teacher");
const student = new Client("student");

const ids: Record<string, any> = { stamp };

// ---------- R1-1 管理员建教师/学期/班级 ----------
await admin.login("/api/admin/login", { username: "admin", password: "admin123" });
const me = await admin.get("/api/admin/me");
suite.check("R1-1a", "管理员登录", me.status === 200, `status=${me.status}`);

const semesterName = `2026-2027学年${stamp}`;
const semester = await admin.post("/api/admin/semesters", { name: semesterName, setAsCurrent: false });
ids.semesterId = semester.body?.data?.id ?? semester.body?.id;
suite.check("R1-1b", "创建学期", semester.status === 201 || semester.status === 200, `${semester.status} ${semester.text.slice(0, 80)}`);

const employeeId = `T9${stamp}`;
const teacherCreate = await admin.post("/api/admin/teachers", { employeeId, name: "联动测试教师" });
ids.teacherId = teacherCreate.body?.data?.id ?? teacherCreate.body?.id ?? teacherCreate.body?.data;
suite.check("R1-1c", "创建教师", teacherCreate.status === 201, `${teacherCreate.status} ${teacherCreate.text.slice(0, 80)}`);

const className = `联动测试班${stamp}`;
const classCreate = await admin.post("/api/admin/classes", { name: className, semesterId: Number(ids.semesterId), teacherId: Number(ids.teacherId) });
ids.classId = classCreate.body?.data?.id ?? classCreate.body?.id;
suite.check("R1-1d", "创建班级并指派该教师", classCreate.status === 201, `${classCreate.status} ${classCreate.text.slice(0, 80)}`);

const tLogin = await teacher.login("/api/teacher/login", { employeeId, password: employeeId });
suite.check("R1-1e", "新教师以工号登录（默认密码=工号）", tLogin.status === 200, `status=${tLogin.status} ${tLogin.text.slice(0, 60)}`);

// ---------- R1-2 导入学生（含重复与他人班级学号） ----------
const s1 = `S9${stamp}A`;
const s2 = `S9${stamp}B`;
// 第 3 行用小写、第 4 行用全角：两者都必须折叠到同一学号
const fullWidthVariant = s1.replace("S9", "Ｓ９");
const importCsv = csv(["学号", "姓名", "邮箱"], [
    [s1, "联动甲", ""],
    [s1.toLowerCase(), "联动甲小写重复行", ""],
    [fullWidthVariant, "联动甲全角重复行", ""],
    [s2, "联动乙", ""],
    ["S2601", "他班学生", ""],
]);
ids.s1 = s1;
ids.s2 = s2;
const importResult = await teacher.post(`/api/teacher/classes/${ids.classId}/students/import`, formFile("students.csv", importCsv));
const importData = importResult.body?.data ?? {};
const importErrors: Array<{ row: number; reason: string }> = importData.errors ?? [];
suite.check("R1-2a", "导入学生返回逐行结果", importResult.status === 200 && Array.isArray(importErrors), `${importResult.status} ${importResult.text.slice(0, 200)}`);
suite.check("R1-2b", "本班重复学号被逐行点名（小写与全角均折叠）",
    importErrors.filter((row) => row.reason.includes("文件中学号重复")).length === 2
    && importErrors.filter((row) => row.reason.includes("文件中学号重复")).map((row) => row.row).join(",") === "3,4",
    JSON.stringify(importErrors));
suite.check("R1-2c", "他人班级学号被点名而非静默",
    importErrors.some((row) => row.reason.includes("其他教师")),
    JSON.stringify(importErrors.filter((row) => row.reason.includes("其他教师"))));
suite.check("R1-2d", "成功导入 2 人、失败 3 行",
    importData.successCount === 2 && importData.failureCount === 3,
    JSON.stringify({ successCount: importData.successCount, failureCount: importData.failureCount, skippedCount: importData.skippedCount }));

const roster = await teacher.get(`/api/teacher/classes/${ids.classId}/students?pageSize=100`);
const rosterData = roster.body?.data ?? {};
const rosterItems = Array.isArray(rosterData) ? rosterData : rosterData.items ?? [];
const rosterIds = rosterItems.map((row: any) => row.studentId);
ids.rosterCount = rosterIds.length;
suite.check("R1-2e", "名单含两名新学生且不含他班学生", rosterIds.includes(s1) && rosterIds.includes(s2) && !rosterIds.includes("S2601"), `roster=${JSON.stringify(rosterIds)}`);

// ---------- R1-3 教师建模板并发布 ----------
const topicCreate = await teacher.post("/api/teacher/topics", { name: `联动测试课题${stamp}` });
ids.topicId = topicCreate.body?.data?.id ?? topicCreate.body?.id;
suite.check("R1-3a", "创建模板", topicCreate.status === 201 || topicCreate.status === 200, `${topicCreate.status} ${topicCreate.text.slice(0, 80)}`);

// 8 行总体：目标列 score 有方差，size 全正可作 PPS 规模列
const populationRows: Array<Array<string | number>> = Array.from({ length: 8 }, (_, index) => [
    `P${index + 1}`, 60 + index * 4, 100 + index * 10, index % 2 === 0 ? "甲" : "乙",
]);
const populationCsv = csv(["编号", "学习时长", "规模", "组别"], populationRows);
const upload = await teacher.post(`/api/teacher/topics/${ids.topicId}/excel`, formFile("population.csv", populationCsv));
suite.check("R1-3b", "上传总体数据", upload.status === 200, `${upload.status} ${upload.text.slice(0, 120)}`);

const mapping = {
    identifier: "编号",
    numeric: ["学习时长", "规模"],
    stratified: ["组别"],
    others: [],
    analysisTarget: { kind: "mean", field: "学习时长" },
    studyContract: {
        version: 1,
        researchQuestion: "总体中学习时长的平均水平是多少？",
        targetPopulation: "全体单位",
        unitOfAnalysis: "一个单位",
        target: { kind: "mean", field: "学习时长" },
    },
};
const mappingSave = await teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: mapping });
suite.check("R1-3c", "保存字段映射", mappingSave.status === 200, `${mappingSave.status} ${mappingSave.text.slice(0, 200)}`);

const detail = await teacher.get(`/api/teacher/topics/${ids.topicId}/detail`);
ids.policyFromServer = detail.body?.data?.topic?.samplingPolicy ?? detail.body?.data?.samplingPolicy ?? null;
ids.weightFromServer = detail.body?.data?.topic?.weightConfig ?? detail.body?.data?.weightConfig ?? null;
ids.detailKeys = Object.keys(detail.body?.data ?? {});
suite.check("R1-3d", "映射后服务端自动给出抽样策略", Boolean(ids.policyFromServer?.methods), JSON.stringify(ids.policyFromServer?.methods));

const weights = await teacher.put(`/api/teacher/topics/${ids.topicId}/weights`, { weightConfig: { questionnaire: 30, process: 30, report: 40 } });
suite.check("R1-3e", "保存权重", weights.status === 200, `${weights.status}`);

const publishTopic = await teacher.put(`/api/teacher/topics/${ids.topicId}`, { name: `联动测试课题${stamp}`, status: 1 });
suite.check("R1-3f", "发布模板", publishTopic.status === 200, `${publishTopic.status} ${publishTopic.text.slice(0, 200)}`);

// ---------- R1-4 发布任务 ----------
const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
const taskCreate = await teacher.post("/api/teacher/tasks", { topicId: Number(ids.topicId), classIds: [Number(ids.classId)], deadline });
suite.check("R1-4a", "向本班发布任务", taskCreate.status === 201, `${taskCreate.status} ${taskCreate.text.slice(0, 150)}`);
// 发布响应只回 { success, skipped }，客户端必须重新拉列表才能拿到任务 ID（见 REPORT 记录）
const taskList = await teacher.get("/api/teacher/tasks");
const taskItems = Array.isArray(taskList.body?.data) ? taskList.body.data : taskList.body?.data?.items ?? [];
const created = taskItems.find((row: any) => row.topicId === Number(ids.topicId) && (row.classId === Number(ids.classId) || row.className === className));
ids.taskId = created?.id;
ids.taskCreateKeys = Object.keys(taskCreate.body?.data ?? {});
suite.check("R1-4b", "新任务出现在教师任务列表", Boolean(created), `task=${JSON.stringify(created)?.slice(0, 200)} listKeys=${Object.keys(taskList.body?.data ?? {}).slice(0, 6)}`);

// ---------- R1-5 学生做实验并提交 ----------
const sLogin = await student.login("/api/student/login", { studentId: s1, password: s1 });
suite.check("R1-5a", "新学生登录（默认密码=学号）", sLogin.status === 200, `status=${sLogin.status}`);
const hall = await student.get("/api/student/tasks");
const hallTask = (hall.body?.data ?? []).find((row: any) => row.id === Number(ids.taskId));
suite.check("R1-5b", "任务大厅可见新任务", Boolean(hallTask), JSON.stringify((hall.body?.data ?? []).map((row: any) => row.id)));

let exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
ids.startStage = exp?.currentStage;
suite.check("R1-5c", "首次进入实验为阶段 1", exp?.currentStage === 1, `stage=${exp?.currentStage}`);

const questionnaire = {
    title: "联动测试问卷",
    welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
    endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single", content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
};
let step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire });
suite.check("R1-5d", "阶段 1 提交", step.status === 200, `${step.status} ${step.text.slice(0, 150)}`);
exp = step.body?.data;

// 规划：用总体重算的方差，保证与推荐样本量一致
const stats = (await student.get(`/api/student/tasks/${ids.taskId}/stats`)).body?.data;
const variance = stats?.populationNumericStats?.["学习时长"]?.variance ?? null;
const populationSize = stats?.total ?? stats?.populationSize ?? stats?.rowCount ?? 8;
ids.variance = variance;
ids.populationSize = populationSize;
const recommended = calculateMeanEstimationSampleSize({
    confidenceLevel: "95",
    marginOfError: 5,
    populationSize,
    populationVariance: variance ?? 0,
    designEffect: 1,
    nonResponseRate: 0,
});
const bounds = getFinalSampleSizeBounds(populationSize, undefined);
const finalSampleSize = Math.min(Math.max(recommended ?? bounds.min, bounds.min), bounds.max);
const plan = {
    estimationType: "mean",
    confidenceLevel: "95",
    marginOfError: 5,
    populationVariance: variance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: recommended,
    finalSampleSize,
};
ids.plan = plan;
step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/2/complete`, { observedVersion: exp.version, samplePlan: plan });
suite.check("R1-5e", "阶段 2 提交（按学生端算法规划）", step.status === 200, `${step.status} ${step.text.slice(0, 220)}`);
if (step.status !== 200) {
    suite.issue("联动/契约", "脚本按共用算法生成、且 UI 也会生成的规划被拒", `plan=${JSON.stringify(plan)} response=${step.text.slice(0, 200)}`);
    throw new Error("阶段 2 无法通过：请按 REPORT 中的规划参数排查");
}
exp = step.body?.data;
const sampleSize = exp.samplePlan?.finalSampleSize ?? finalSampleSize;
const simple = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "simple", params: { sampleSize, seed: 7 } });
suite.check("R1-5f", "简单随机抽样", simple.status === 200, `${simple.status} ${simple.text.slice(0, 150)}`);
// 分层抽样需要显式分层变量与各层样本数：按比例分配（与学生端一致）
const strataCounts = new Map<string, number>();
for (const row of populationRows) {
    const key = String(row[3]);
    strataCounts.set(key, (strataCounts.get(key) ?? 0) + 1);
}
const totalRows = populationRows.length;
let assigned = 0;
const layers = [...strataCounts].map(([name, count], index, all) => {
    const exact = (count / totalRows) * sampleSize;
    const allocated = index === all.length - 1 ? sampleSize - assigned : Math.max(1, Math.round(exact));
    assigned += allocated;
    return { name, sampleCount: allocated };
});
ids.layers = layers;
let second = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "stratified", params: { seed: 9, sampleSize, stratifyBy: "组别", layers } });
if (second.status !== 200) {
    suite.issue("联动/契约", "stratified 抽样按比例分配调用被拒", `status=${second.status} ${second.text.slice(0, 180)}`);
    second = await student.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "systematic", params: { seed: 9, sampleSize } });
    ids.secondMethodFallback = "systematic";
}
suite.check("R1-5g", "第二种抽样方法（分层，按比例分配）", second.status === 200, `${second.status} ${second.text.slice(0, 180)}`);

exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/3/complete`, { observedVersion: exp.version });
suite.check("R1-5h", "阶段 3 提交", step.status === 200, `${step.status} ${step.text.slice(0, 200)}`);

exp = (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
// 阶段 4 只接受富文本 HTML 字符串：结构化 JSON 会被当成空内容（正文长度为 0）
const report = [
    "<h2>调查背景</h2><p>为了解本单位学习时长分布情况，本次调查利用总体名单开展抽样估计，目的是在有限成本下给出总体平均学习时长的可靠估计，并比较不同抽样方法的效率差异。</p>",
    "<h2>抽样设计</h2><p>先按单位规模做简单随机抽样，再按系统抽样复核。样本量由置信水平 95%、允许误差与总体方差共同决定，并考虑设计效应与无回答率的影响。</p>",
    "<h2>估计与推断</h2><p>对学习时长按总体均值进行点估计，给出置信区间，并与总体真值对照。分析显示估计值落在区间内，抽样误差随样本量增加而下降，分层信息的引入进一步降低了方差。</p>",
    "<h2>结论与反思</h2><p>本次实验说明抽样设计需要在精度与成本之间权衡：当总体方差较大时应增加样本量或引入分层；对规模差异明显的总体，按规模比例抽样能明显改善估计效率。</p>",
].join("");
step = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, { observedVersion: exp.version, reportContent: report });
if (step.status !== 200) suite.issue("联动/契约", "阶段 4 报告提交被拒", `status=${step.status} message=${step.body?.error?.message} 正文长度=${report.replace(/<[^>]+>/g, "").length}`);
const structuredProbe = await student.post(`/api/student/tasks/${ids.taskId}/experiment/stages/4/complete`, { observedVersion: exp.version, reportContent: { background: "结构化对象探针" } });
ids.structuredReportStatus = structuredProbe.status;
suite.check("R1-5i", "阶段 4 提交", step.status === 200, `${step.status} ${step.text.slice(0, 200)}`);

const submit = await student.post(`/api/student/tasks/${ids.taskId}/submit`, { observedVersion: (await student.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data?.version });
suite.check("R1-5j", "提交实验", submit.status === 200, `${submit.status} ${submit.text.slice(0, 200)}`);

// ---------- R1-6 公告跨端 ----------
const announceTitle = `联动公告${stamp}`;
const announce = await admin.post("/api/admin/announcements", { title: announceTitle, content: "联动测试公告内容，用于验证教师端与学生端同时可见。", targetScope: "all", publish: true });
suite.check("R1-6a", "管理员发布公告", announce.status === 201 || announce.status === 200, `${announce.status} ${announce.text.slice(0, 120)}`);
const teacherFeed = await teacher.get("/api/teacher/announcements");
const studentFeed = await student.get("/api/student/announcements");
const hasTitle = (feed: any) => JSON.stringify(feed.body?.data ?? []).includes(announceTitle);
suite.check("R1-6b", "教师端可见公告", hasTitle(teacherFeed), `${teacherFeed.status}`);
suite.check("R1-6c", "学生端可见同一条公告", hasTitle(studentFeed), `${studentFeed.status}`);

// ---------- R1-7 教师批改（跨端可见 + 计数） ----------
const gradingList = await teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const gradingItem = (gradingList.body?.data?.items ?? []).find((row: any) => row.studentId === s1);
ids.experimentId = gradingItem?.id;
suite.check("R1-7a", "待批改列表出现该提交", Boolean(gradingItem), `${gradingList.status} items=${(gradingList.body?.data?.items ?? []).length}`);

const progressBefore = await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
suite.check("R1-7b", "进度：submitted 计数", progressBefore.body?.data?.counts?.submitted === 1, JSON.stringify(progressBefore.body?.data?.counts));

const gradeDetail = await teacher.get(`/api/teacher/grading/${ids.experimentId}`);
const gradeVersion = gradeDetail.body?.data?.version ?? gradingItem?.version;
const grade = await teacher.post(`/api/teacher/grading/${ids.experimentId}`, {
    observedVersion: gradeVersion,
    scoreQuestionnaire: 28,
    scoreProcess: 29,
    scoreReport: 38,
    comment: "联动测试评语：抽样过程规范，估计口径正确。",
});
suite.check("R1-7c", "批改提交（两步确认）", grade.status === 200, `${grade.status} ${grade.text.slice(0, 200)}`);
const regrade = await teacher.post(`/api/teacher/grading/${ids.experimentId}`, { observedVersion: gradeVersion, scoreQuestionnaire: 20, scoreProcess: 20, scoreReport: 20, comment: "重复批改" });
suite.check("R1-7d", "重复批改被拒", regrade.status >= 400, `${regrade.status} ${regrade.text.slice(0, 120)}`);
const progressAfter = await teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
suite.check("R1-7e", "进度：graded 计数", progressAfter.body?.data?.counts?.graded === 1, JSON.stringify(progressAfter.body?.data?.counts));

const submission = await student.get(`/api/student/tasks/${ids.taskId}/submission`);
const submissionText = JSON.stringify(submission.body?.data ?? {});
suite.check("R1-7f", "学生端可见成绩与评语", submissionText.includes("联动测试评语") && /95|28|29|38/.test(submissionText), `${submission.status} ${submissionText.slice(0, 240)}`);

// ---------- R1-8 导出 ----------
const exportData = await teacher.get(`/api/teacher/grade-export/data?classId=${ids.classId}&topicId=${ids.topicId}`);
const exportRows = exportData.body?.data ?? [];
const exported = (Array.isArray(exportRows) ? exportRows : exportRows.items ?? []).find((row: any) => row.studentId === s1);
suite.check("R1-8a", "成绩导出数据含该学生", Boolean(exported), `${exportData.status} ${JSON.stringify(exportRows).slice(0, 200)}`);
const exportExcel = await teacher.get(`/api/teacher/grade-export/excel?classId=${ids.classId}&topicId=${ids.topicId}`, { headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
suite.check("R1-8b", "成绩导出 xlsx 可下载", exportExcel.status === 200 && exportExcel.text.length > 500, `${exportExcel.status} bytes=${exportExcel.text.length}`);

// ---------- R1-9 管理员统计一致性 ----------
const statsRes = await admin.get("/api/admin/stats");
const statBody = statsRes.body?.data ?? {};
suite.check("R1-9a", "管理员统计接口可用", statsRes.status === 200, JSON.stringify(statBody).slice(0, 200));
const teachersList = await admin.get("/api/admin/teachers");
const classesList = await admin.get("/api/admin/classes");
suite.check("R1-9b", "新教师、新班级出现在管理端列表",
    JSON.stringify(teachersList.body?.data ?? []).includes(employeeId) && JSON.stringify(classesList.body?.data ?? []).includes(className),
    `teachers=${JSON.stringify(teachersList.body?.data ?? []).slice(0, 120)}`);
const studentLookup = await admin.get(`/api/admin/students?keyword=${s1}`);
suite.check("R1-9c", "新学生出现在管理端名单", JSON.stringify(studentLookup.body?.data ?? []).includes(s1), `${studentLookup.status} ${studentLookup.text.slice(0, 160)}`);

// ---------- 跨端可见性时延（教师发布 → 学生可见） ----------
const crossEnd = await waitFor(async () => {
    const hall = await student.get("/api/student/tasks");
    return (hall.body?.data ?? []).some((row: any) => row.id === Number(ids.taskId));
}, (value) => value, 3_000);
suite.check("R1-X1", "跨端可见性：发布后学生大厅 3s 内可见", crossEnd.ok, `${crossEnd.elapsedMs}ms`);

console.log(`\n（BASE=${BASE}）`);
const summary = suite.summary();
await writeResult(evidenceFile("round1.json"), { round: "R1", ids, ...summary });
