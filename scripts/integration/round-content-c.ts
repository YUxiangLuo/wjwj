// 研究内容联动 C：小总体均值（学生每周阅读时长，24 行）+ 换分层字段（学院 → 年级）+ 普查边界
// 要点：PPS 无合格规模列 → 自动不适用且不得误报"被跳过"；小总体上界 1～24；样本量取满时进入普查口径
import { Suite, evidenceFile, writeResult } from "./lib";
import { bootstrap, createTopic, publishAndAssign, studentFlow } from "./lib-flow";
import { calculateMeanEstimationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

const suite = new Suite();
const stamp = String(Date.now()).slice(-6);
const ids: Record<string, any> = { stamp };
const POPULATION = "storage/topics/seed-population-reading-hours.csv";
const TARGET = { kind: "mean" as const, field: "每周阅读时长" };

const h = await bootstrap({ stamp, teacherName: "小总体教师", className: "小总体班", semesterPrefix: "小总体学期", studentNames: ["小总体甲", "小总体乙"] });
ids.employeeId = h.employeeId;
ids.classId = h.classId;

const mapping = {
    identifier: "编号",
    numeric: ["每周阅读时长"],
    stratified: ["年级"],
    others: ["学院", "是否住宿"],
    analysisTarget: TARGET,
    studyContract: {
        version: 1,
        researchQuestion: "该校学生每周阅读时长的平均水平是多少？（按年级分层）",
        targetPopulation: "该校全体学生",
        unitOfAnalysis: "一名学生",
        target: TARGET,
    },
};
const topicName = `小总体课题${stamp}`;
const created = await createTopic({ teacher: h.teacher, name: topicName, storagePath: POPULATION, mapping });
ids.topicId = created.topicId;
ids.autoPolicy = created.policy?.methods ?? null;
suite.check("C-1a", "建小总体模板（目标 每周阅读时长，按年级分层）", created.mapping.status === 200, `${created.mapping.status} ${created.mapping.text.slice(0, 160)}`);
suite.check("C-1b", "PPS 自动设为不适用（无合格规模列），必做简单随机",
    created.policy?.methods?.pps === "disabled" && created.policy?.methods?.simple === "required",
    JSON.stringify(ids.autoPolicy));
const detail = (await h.teacher.get(`/api/teacher/topics/${ids.topicId}/detail`)).body?.data?.topic ?? {};
const numericFields = ((detail.fieldMapping ?? detail.topic?.fieldMapping)?.numeric ?? []) as string[];
ids.numericFields = numericFields;
suite.check("C-1c", "除目标列外没有其他数值列（因此不存在合格 PPS 规模变量）",
    numericFields.length === 1 && numericFields[0] === "每周阅读时长", JSON.stringify(numericFields));

// ---- 小总体边界 ----
const oversizeTopicProbe = await h.teacher.get(`/api/teacher/topics/${ids.topicId}/detail`);
ids.populationSize = oversizeTopicProbe.body?.data?.topic?.populationSize ?? oversizeTopicProbe.body?.data?.populationSize ?? null;
const bounds = getFinalSampleSizeBounds(24);
ids.bounds = bounds;
const recommended = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 1, populationSize: 24, populationVariance: 14.085144927536229, designEffect: 1, nonResponseRate: 0 });
ids.recommendedForOneUnit = recommended;
suite.check("C-2a", "总体规模 24，最终样本量上界为 24",
    bounds.max === 24 && bounds.min === 1, JSON.stringify({ bounds, recommended, populationSize: ids.populationSize }));

const assigned = await publishAndAssign({ teacher: h.teacher, topicId: ids.topicId, topicName, classId: h.classId });
ids.taskId = assigned.taskId;
suite.check("C-3a", "发布模板并向班级发任务", assigned.publish.status === 200 && Boolean(ids.taskId), `publish=${assigned.publish.status} task=${ids.taskId}`);

const studentA = h.students[h.studentIds[0]!]!;
const studentB = h.students[h.studentIds[1]!]!;

// 学生 A：先把样本量提交为 25（越界）应被拒，再取满 24（等于总体 → 普查）
let exp = (await studentA.get(`/api/student/tasks/${ids.taskId}/experiment`)).body?.data;
const stage1 = await studentA.post(`/api/student/tasks/${ids.taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire: {
    title: "小总体问卷", welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
    endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single", content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
} });
exp = stage1.body?.data;
const basePlan = { estimationType: "mean", confidenceLevel: "95", marginOfError: 1, populationVariance: 14.085144927536229, designEffect: 1, nonResponseRate: 0, recommendedSize: recommended };
const oversize = await studentA.post(`/api/student/tasks/${ids.taskId}/experiment/stages/2/complete`, { observedVersion: exp.version, samplePlan: { ...basePlan, finalSampleSize: 25 } });
ids.oversizePlan = { status: oversize.status, message: oversize.body?.error?.message ?? null };
suite.check("C-2b", "最终样本量超过总体规模（25 > 24）被拒并给出区间",
    oversize.status === 400 && String(ids.oversizePlan.message).includes("1～24"), JSON.stringify(ids.oversizePlan));

const flow = await studentFlow(studentA, ids.taskId, "mean", { marginOfError: 1, varianceField: "每周阅读时长", finalSampleSize: 24, stratifyBy: "年级" });
ids.plan = flow.steps.plan ?? null;
suite.check("C-3b", "样本量取满总体（24=普查）时全流程可完成并提交",
    flow.ok === true && flow.sampleSize === 24, flow.ok ? `sampleSize=${flow.sampleSize}` : JSON.stringify(flow.steps).slice(0, 240));
ids.stratify = { field: flow.steps.stratifyBy, layers: flow.steps.layers };
suite.check("C-3c", "按年级（4 层，每层 6 个单位）分层执行",
    flow.steps.stratifyBy === "年级" && (flow.steps.layers as any[])?.length === 4, JSON.stringify(ids.stratify));
suite.check("C-3d", "模板未启用 PPS，学生抽样记录里不出现 PPS 条目（也不该出现「不适用」标记）",
    flow.experiment?.samplingResults?.pps === undefined, JSON.stringify(Object.keys(flow.experiment?.samplingResults ?? {})));

const metrics = flow.metrics;
ids.censusMetrics = {
    populationValue: metrics?.target?.populationValue ?? null,
    methods: Object.fromEntries(Object.entries(metrics?.target?.methods ?? {}).map(([key, value]: [string, any]) => [key, { estimate: value?.estimate ?? null, standardError: value?.standardError ?? null, effectiveSampleSize: value?.effectiveSampleSize ?? null, reliability: value?.reliability?.status ?? null, reasons: value?.reliability?.reasons ?? null }])),
};
suite.check("C-4a", "总体真值与总体文件一致（7.4583）",
    Math.abs(Number(ids.censusMetrics.populationValue) - 7.458333333333333) < 1e-6, JSON.stringify(ids.censusMetrics.populationValue));
const censusMethods = ["simple", "stratified"].map((key) => (ids.censusMetrics.methods as Record<string, any>)[key]);
suite.check("C-4b", "取满总体时估计等于真值、标准误为 0、按普查口径标注",
    censusMethods.every((row) => Math.abs(row.estimate - 7.458333333333333) < 1e-6)
    && censusMethods.every((row) => row.reliability === "census"),
    JSON.stringify(ids.censusMetrics.methods));
suite.check("C-4c", "非普查样本量的方法保持可用估计（对照）",
    (ids.censusMetrics.methods as Record<string, any>).systematic?.reliability === "unavailable",
    JSON.stringify(Object.fromEntries(Object.entries(ids.censusMetrics.methods as Record<string, any>).map(([key, row]) => [key, row.reliability]))));

// 学生 B：用默认规划（有限总体校正后的样本量 < 24）作对照
const flowB = await studentFlow(studentB, ids.taskId, "mean", { marginOfError: 1, varianceField: "每周阅读时长", stratifyBy: "年级" });
ids.planB = flowB.steps.plan ?? null;
suite.check("C-3e", "第二名学生用有限总体校正后的样本量完成并提交",
    flowB.ok === true && flowB.sampleSize < 24 && flowB.sampleSize > 1, flowB.ok ? `sampleSize=${flowB.sampleSize}` : JSON.stringify(flowB.steps).slice(0, 200));
ids.metricsB = {
    methods: Object.fromEntries(Object.entries(flowB.metrics?.target?.methods ?? {}).map(([key, value]: [string, any]) => [key, { estimate: value?.estimate ?? null, standardError: value?.standardError ?? null, effectiveSampleSize: value?.effectiveSampleSize ?? null, reliability: value?.reliability?.status ?? null }])),
};
suite.check("C-4d", "小总体下估计接近真值、标准误有限总体校正后小于 SRS 等价样本量口径",
    Object.values(ids.metricsB.methods as Record<string, any>).filter((row) => row.standardError !== null).every((row) => row.standardError > 0 && row.effectiveSampleSize > 0),
    JSON.stringify(ids.metricsB.methods));

// ---- 教师侧：不得误报被跳过的 PPS ----
const progress = await h.teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
ids.progress = progress.body?.data ?? null;
suite.check("C-5a", "模板按规则禁用 PPS 时，教师进度不出现「被跳过」提示",
    ids.progress?.ppsUnavailable?.count === 0 && ids.progress?.counts?.submitted === 2,
    JSON.stringify({ counts: ids.progress?.counts, pps: ids.progress?.ppsUnavailable }));

const gradingList = await h.teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const item = (gradingList.body?.data?.items ?? []).find((row: any) => row.studentId === h.studentIds[0]);
const gradingDetail = await h.teacher.get(`/api/teacher/grading/${item.id}`);
const grade = await h.teacher.post(`/api/teacher/grading/${item.id}`, { observedVersion: gradingDetail.body?.data?.version, scoreQuestionnaire: 28, scoreProcess: 28, scoreReport: 39, comment: "小总体研究内容批改通过。" });
suite.check("C-5b", "教师批改小总体提交", grade.status === 200, `${grade.status} ${grade.text.slice(0, 120)}`);
const submission = await studentA.get(`/api/student/tasks/${ids.taskId}/submission`);
suite.check("C-5c", "学生端可见成绩与评语",
    Number(submission.body?.data?.totalScore) > 0 && String(submission.body?.data?.teacherComment).includes("小总体"), JSON.stringify({ score: submission.body?.data?.totalScore }));
const exportData = await h.teacher.get(`/api/teacher/grade-export/data?classId=${h.classId}&topicId=${ids.topicId}`);
ids.exportRows = (exportData.body?.data ?? []).map((row: any) => ({ studentId: row.studentId, scoreQuestionnaire: row.scoreQuestionnaire }));
// 未批改的学生也会出现在导出里（分数留空），批改过的带分数
suite.check("C-5d", "成绩导出包含全班：已批改有分数、未批改留空",
    ids.exportRows.length === 2
    && ids.exportRows.some((row: any) => row.studentId === h.studentIds[0] && Number(row.scoreQuestionnaire) === 28)
    && ids.exportRows.some((row: any) => row.studentId === h.studentIds[1] && (row.scoreQuestionnaire === "" || row.scoreQuestionnaire === null)),
    JSON.stringify(ids.exportRows));

console.log(`（证据文件：${evidenceFile("round-content-c.json")}）`);
const summary = suite.summary();
await writeResult(evidenceFile("round-content-c.json"), { round: "C-小总体", ids, ...summary });
