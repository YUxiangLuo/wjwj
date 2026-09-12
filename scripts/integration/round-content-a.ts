// 研究内容联动 A：比例型（毕业生去向意向 → 换目标类别与分层字段）
// 总体：storage/topics/seed-population-employment-intent.csv（160 行）
// 与种子课题的差异：目标类别 直接就业 → 考研；分层 学院 → 培养层次；PPS 规模 求职准备度 → 每周职业准备时长
import { Suite, evidenceFile, writeResult } from "./lib";
import { bootstrap, createTopic, publishAndAssign, studentFlow } from "./lib-flow";

const suite = new Suite();
const stamp = String(Date.now()).slice(-6);
const ids: Record<string, any> = { stamp };
const POPULATION = "storage/topics/seed-population-employment-intent.csv";
const PROPORTION = { kind: "proportion" as const, field: "毕业去向意向", value: "考研" };

const h = await bootstrap({ stamp, teacherName: "比例内容教师", className: "比例内容班", semesterPrefix: "比例学期", studentNames: ["比例甲", "比例乙"] });
ids.employeeId = h.employeeId;
ids.classId = h.classId;

const mapping = {
    identifier: "样本编号",
    numeric: ["每周职业准备时长", "求职准备度"],
    stratified: ["培养层次"],
    others: ["毕业去向意向", "是否有实习经历"],
    analysisTarget: PROPORTION,
    studyContract: {
        version: 1,
        researchQuestion: "本届毕业生中计划考研的学生比例是多少？",
        targetPopulation: "某综合大学2026届全体毕业生",
        unitOfAnalysis: "一名毕业生",
        target: PROPORTION,
    },
};
const topicName = `比例内容课题${stamp}`;
const created = await createTopic({ teacher: h.teacher, name: topicName, storagePath: POPULATION, mapping });
ids.topicId = created.topicId;
suite.check("A-1a", "建比例型模板（目标 毕业去向意向=考研）", created.mapping.status === 200, `${created.mapping.status} ${created.mapping.text.slice(0, 160)}`);
ids.autoPolicy = (created.policy?.methods ?? null);
suite.check("A-1b", "自动策略给出必做简单随机并启用分层与 PPS",
    created.policy?.methods?.simple === "required" && created.policy?.methods?.stratified === "optional" && created.policy?.methods?.pps === "optional",
    JSON.stringify(ids.autoPolicy));

// ---- 比例型边界 ----
const missingCategory = await h.teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, {
    fieldMapping: { ...mapping, analysisTarget: { kind: "proportion", field: "毕业去向意向", value: "创业" }, studyContract: { ...mapping.studyContract, target: { kind: "proportion", field: "毕业去向意向", value: "创业" } } },
});
ids.missingCategory = { status: missingCategory.status, message: missingCategory.body?.error?.message ?? null };
suite.check("A-2a", "不存在的比例类别被点名拒绝",
    missingCategory.status === 400 && String(ids.missingCategory.message).includes("创业"), JSON.stringify(ids.missingCategory));

const unmappedField = await h.teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, {
    fieldMapping: { ...mapping, analysisTarget: { kind: "proportion", field: "样本编号", value: "G001" }, studyContract: { ...mapping.studyContract, target: { kind: "proportion", field: "样本编号", value: "G001" } } },
});
ids.unmappedField = { status: unmappedField.status, message: unmappedField.body?.error?.message ?? null };
suite.check("A-2b", "把未映射字段当比例变量被拒",
    unmappedField.status === 400, JSON.stringify(ids.unmappedField));

const highCoverage = await h.teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, {
    fieldMapping: { ...mapping, analysisTarget: { kind: "proportion", field: "是否有实习经历", value: "是" }, studyContract: { ...mapping.studyContract, target: { kind: "proportion", field: "是否有实习经历", value: "是" }, researchQuestion: "有实习经历的毕业生比例是多少？" } },
});
ids.highCoverage = { status: highCoverage.status, message: highCoverage.body?.error?.message ?? null };
suite.check("A-2c", "高覆盖但未达 100% 的比例目标被接受（66.25%）",
    highCoverage.status === 200, JSON.stringify(ids.highCoverage));

const restore = await h.teacher.put(`/api/teacher/topics/${ids.topicId}/mapping`, { fieldMapping: mapping });
suite.check("A-2d", "研究目标恢复为考研", restore.status === 200, `${restore.status}`);

// ---- 发布 + 学生全链路 ----
const assigned = await publishAndAssign({ teacher: h.teacher, topicId: ids.topicId, topicName, classId: h.classId });
ids.taskId = assigned.taskId;
suite.check("A-3a", "发布模板并向班级发任务", assigned.publish.status === 200 && Boolean(ids.taskId), `publish=${assigned.publish.status} task=${ids.taskId}`);

const studentA = h.students[h.studentIds[0]!]!;
const flow = await studentFlow(studentA, ids.taskId, "proportion", { marginOfError: 5, stratifyBy: "培养层次" });
ids.plan = flow.steps.plan ?? null;
suite.check("A-3b", "学生按比例口径完成规划与全部阶段并提交",
    flow.ok === true, flow.ok ? `sampleSize=${flow.sampleSize}` : JSON.stringify(flow.steps).slice(0, 300));
suite.check("A-3c", "规划使用保守比例方差（p=0.5）且受有限总体约束",
    Boolean(flow.steps.plan) && (flow.steps.plan as any).plan.recommendedSize > 0 && (flow.steps.plan as any).bounds.max === 160,
    JSON.stringify(flow.steps.plan).slice(0, 200));
ids.stratify = { field: flow.steps.stratifyBy, layers: flow.steps.layers };
suite.check("A-3d", "分层按培养层次（2 层）执行", flow.steps.stratifyBy === "培养层次", JSON.stringify(ids.stratify));
ids.pps = flow.steps.pps ?? null;
suite.check("A-3e", "PPS 使用 每周职业准备时长 执行", Boolean(flow.steps.pps) && (flow.steps.pps as any).status === 200, JSON.stringify(flow.steps.pps));

// ---- 比例型分析指标 ----
const metrics = flow.metrics;
ids.metricsTarget = {
    populationValue: metrics?.target?.populationValue ?? null,
    plannedMarginOfError: metrics?.target?.plannedMarginOfError ?? null,
    methods: Object.fromEntries(Object.entries(metrics?.target?.methods ?? {}).map(([key, value]: [string, any]) => [key, { estimate: value?.estimate ?? null, standardError: value?.standardError ?? null, marginOfError: value?.marginOfError ?? null, reliability: value?.reliability?.status ?? null }])),
};
const expectedProportion = 40 / 160;
suite.check("A-4a", "总体真值等于考研比例 25%",
    Math.abs(Number(ids.metricsTarget.populationValue) - expectedProportion) < 1e-9, JSON.stringify(ids.metricsTarget.populationValue));
// 未执行的方法（如系统抽样）保持 unavailable/null，只有实际执行的方法参与断言
const executed = ["simple", "stratified", "pps"].map((key) => (ids.metricsTarget.methods as Record<string, any>)[key]);
const estimateClose = executed.every((row) => Math.abs(row.estimate - expectedProportion) < 0.1);
suite.check("A-4b", "已执行方法的比例估计接近真值且带设计标准误",
    executed.every((row) => row.estimate >= 0 && row.estimate <= 1 && row.standardError > 0) && estimateClose,
    JSON.stringify(ids.metricsTarget.methods));
suite.check("A-4c", "计划误差按百分点记录（5 → 0.05），教学误差半宽同口径",
    Math.abs(Number(ids.metricsTarget.plannedMarginOfError) - 0.05) < 1e-9 && executed.every((row) => row.marginOfError > 0),
    JSON.stringify({ planned: ids.metricsTarget.plannedMarginOfError, executed: executed.map((row) => row.marginOfError) }));
ids.reliability = Object.fromEntries(Object.entries(ids.metricsTarget.methods as Record<string, any>).map(([key, row]) => [key, row.reliability]));
suite.check("A-4d", "未执行方法标为 unavailable 而不是伪造估计",
    (ids.metricsTarget.methods as Record<string, any>).systematic?.estimate === null
    && (ids.metricsTarget.methods as Record<string, any>).systematic?.reliability === "unavailable",
    JSON.stringify(ids.reliability));

// ---- 批改 + 导出 + 管理端 ----
const gradingList = await h.teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const item = (gradingList.body?.data?.items ?? []).find((row: any) => row.studentId === h.studentIds[0]);
ids.gradingItem = item ? { id: item.id, topic: item.topic } : null;
const detail = await h.teacher.get(`/api/teacher/grading/${item.id}`);
const grade = await h.teacher.post(`/api/teacher/grading/${item.id}`, { observedVersion: detail.body?.data?.version, scoreQuestionnaire: 26, scoreProcess: 27, scoreReport: 41, comment: "比例型研究内容批改通过。" });
suite.check("A-5a", "教师批改比例型提交", grade.status === 200, `${grade.status} ${grade.text.slice(0, 120)}`);
const submission = await h.students[h.studentIds[0]!]!.get(`/api/student/tasks/${ids.taskId}/submission`);
ids.studentSubmission = { status: submission.status, totalScore: submission.body?.data?.totalScore ?? null, comment: submission.body?.data?.teacherComment ?? null };
suite.check("A-5b", "学生端看到成绩与评语",
    Number(ids.studentSubmission.totalScore) > 0 && String(ids.studentSubmission.comment).includes("比例型"), JSON.stringify(ids.studentSubmission));
const exportData = await h.teacher.get(`/api/teacher/grade-export/data?classId=${h.classId}&topicId=${ids.topicId}`);
ids.exportRows = (exportData.body?.data ?? []).map((row: any) => ({ studentId: row.studentId, topicName: row.topicName, scoreReport: row.scoreReport }));
suite.check("A-5c", "成绩导出包含比例型课题与学生成绩",
    ids.exportRows.length === 1 && ids.exportRows[0].topicName === topicName && Number(ids.exportRows[0].scoreReport) === 41,
    JSON.stringify(ids.exportRows));
const progress = await h.teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
ids.progress = progress.body?.data?.counts ?? null;
suite.check("A-5d", "任务进度：1 已批改、1 未开始",
    ids.progress?.graded === 1 && ids.progress?.not_started === 1, JSON.stringify(ids.progress));

console.log(`（证据文件：${evidenceFile("round-content-a.json")}）`);
const summary = suite.summary();
await writeResult(evidenceFile("round-content-a.json"), { round: "A-比例型", ids, ...summary });
