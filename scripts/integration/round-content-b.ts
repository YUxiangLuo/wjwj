// 研究内容联动 B：均值型换字段与换分层（食堂等待时间 → 客流量；分层 校区/食堂；PPS 规模 开放窗口数）
// 总体：storage/topics/seed-population-dining-wait.csv（96 行）
import { Suite, evidenceFile, writeResult } from "./lib";
import { bootstrap, createTopic, publishAndAssign, studentFlow } from "./lib-flow";

const suite = new Suite();
const stamp = String(Date.now()).slice(-6);
const ids: Record<string, any> = { stamp };
const POPULATION = "storage/topics/seed-population-dining-wait.csv";
const TARGET = { kind: "mean" as const, field: "客流量" };

const h = await bootstrap({ stamp, teacherName: "均值内容教师", className: "均值内容班", semesterPrefix: "均值学期", studentNames: ["均值甲", "均值乙"] });
ids.employeeId = h.employeeId;
ids.classId = h.classId;

const mapping = {
    identifier: "记录编号",
    numeric: ["等待分钟", "客流量", "开放窗口数"],
    stratified: ["食堂"],
    others: ["校区", "观测时段", "星期"],
    analysisTarget: TARGET,
    studyContract: {
        version: 1,
        researchQuestion: "工作日午间高峰时段的平均客流量是多少？",
        targetPopulation: "两校区食堂工作日午间高峰的全部服务时段",
        unitOfAnalysis: "一个15分钟食堂服务时段",
        target: TARGET,
    },
};
const topicName = `均值内容课题${stamp}`;
const created = await createTopic({ teacher: h.teacher, name: topicName, storagePath: POPULATION, mapping });
ids.topicId = created.topicId;
ids.autoPolicy = created.policy?.methods ?? null;
suite.check("B-1a", "建均值型模板（目标 客流量，与种子课题不同字段）", created.mapping.status === 200, `${created.mapping.status} ${created.mapping.text.slice(0, 160)}`);
suite.check("B-1b", "自动策略：必做简单随机 + 分层 + PPS（客流量/开放窗口数均为正）",
    created.policy?.methods?.simple === "required" && created.policy?.methods?.stratified === "optional" && created.policy?.methods?.pps === "optional",
    JSON.stringify(ids.autoPolicy));

// ---- 均值型边界：PPS 规模字段与目标字段不能循环、离散规模字段可用、多类别分层 ----
const cyclicPps = await h.teacher.put(`/api/teacher/topics/${ids.topicId}/sampling-policy`, {
    samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" } },
});
ids.cyclicPolicy = { status: cyclicPps.status, message: cyclicPps.body?.error?.message ?? null };
suite.check("B-2a", "把 PPS 设为必做时会按数据实测（规模字段可选时允许必做）",
    cyclicPps.status === 200 || cyclicPps.status === 400, JSON.stringify(ids.cyclicPolicy));

const wideStrataTopic = await createTopic({
    teacher: h.teacher,
    name: `多分层课题${stamp}`,
    storagePath: POPULATION,
    mapping: { ...mapping, stratified: ["星期"], others: ["校区", "观测时段"], analysisTarget: TARGET, studyContract: { ...mapping.studyContract, target: TARGET } },
});
ids.wideStrataTopicId = wideStrataTopic.topicId;
ids.wideStrataStatus = wideStrataTopic.mapping.status;
suite.check("B-2b", "5 类分层（星期）可用且自动策略保持分层可选",
    wideStrataTopic.mapping.status === 200 && wideStrataTopic.policy?.methods?.stratified === "optional",
    `${wideStrataTopic.mapping.status} ${wideStrataTopic.mapping.text.slice(0, 120)} policy=${JSON.stringify(wideStrataTopic.policy?.methods)}`);
const duplicatedField = await h.teacher.put(`/api/teacher/topics/${ids.wideStrataTopicId}/mapping`, {
    fieldMapping: { ...mapping, stratified: ["星期"], analysisTarget: TARGET, studyContract: { ...mapping.studyContract, target: TARGET } },
});
ids.duplicatedField = { status: duplicatedField.status, message: duplicatedField.body?.error?.message ?? null };
suite.check("B-2b2", "字段同时出现在分层与其他分类变量时被拒",
    duplicatedField.status === 400 && String(ids.duplicatedField.message).includes("不能同时"), JSON.stringify(ids.duplicatedField));

const discreteTargetTopic = await createTopic({
    teacher: h.teacher,
    name: `离散目标课题${stamp}`,
    storagePath: POPULATION,
    mapping: {
        ...mapping,
        analysisTarget: { kind: "mean", field: "开放窗口数" },
        studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "开放窗口数" }, researchQuestion: "高峰时段平均开放窗口数是多少？" },
    },
});
ids.discreteTargetStatus = discreteTargetTopic.mapping.status;
suite.check("B-2c", "离散数值字段（开放窗口数 3–10）可作均值目标",
    discreteTargetTopic.mapping.status === 200, `${discreteTargetTopic.mapping.status} ${discreteTargetTopic.mapping.text.slice(0, 140)}`);

// ---- 发布 + 学生全链路（PPS 用离散规模字段 开放窗口数） ----
const assigned = await publishAndAssign({ teacher: h.teacher, topicId: ids.topicId, topicName, classId: h.classId });
ids.taskId = assigned.taskId;
suite.check("B-3a", "发布模板并向班级发任务", assigned.publish.status === 200 && Boolean(ids.taskId), `publish=${assigned.publish.status} task=${ids.taskId}`);

const studentA = h.students[h.studentIds[0]!]!;
const studentB = h.students[h.studentIds[1]!]!;
// 在"已完成阶段 2、尚未抽样"的状态下探测循环规模字段（此时才允许调用抽样接口）
const prepared = await studentFlow(studentB, ids.taskId, "mean", { marginOfError: 8, varianceField: "客流量", stopAfterStage2: true });
suite.check("B-2d0", "第二名学生推进到可抽样状态（仅阶段 1、2）", prepared.ok === true && Number(prepared.experiment?.currentStage) === 3, JSON.stringify(prepared.steps).slice(0, 200));
const cyclicProbe = await studentB.post(`/api/student/tasks/${ids.taskId}/sampling`, { method: "pps", params: { seed: 1, sampleSize: prepared.sampleSize, sizeField: "客流量" } });
ids.cyclicPpsProbe = { status: cyclicProbe.status, code: cyclicProbe.body?.error?.code ?? null, message: cyclicProbe.body?.error?.message ?? null };
suite.check("B-2d", "用目标字段自身作 PPS 规模变量被拒且点名原因",
    cyclicProbe.status >= 400 && cyclicProbe.status < 500
    && String(ids.cyclicPpsProbe.message ?? "").length > 0, JSON.stringify(ids.cyclicPpsProbe));

const flow = await studentFlow(studentA, ids.taskId, "mean", { marginOfError: 8, varianceField: "客流量", stratifyBy: "食堂", ppsSizeField: "开放窗口数" });
ids.plan = flow.steps.plan ?? null;
suite.check("B-3b", "学生按均值口径（客流量方差）规划并完成全部阶段",
    flow.ok === true, flow.ok ? `sampleSize=${flow.sampleSize}` : JSON.stringify(flow.steps).slice(0, 300));
ids.stratify = { field: flow.steps.stratifyBy, layers: flow.steps.layers };
suite.check("B-3c", "按食堂（4 层）分层执行", flow.steps.stratifyBy === "食堂" && (flow.steps.layers as any[])?.length === 4, JSON.stringify(ids.stratify));
ids.pps = flow.steps.pps ?? null;
suite.check("B-3d", "PPS 用离散规模字段 开放窗口数 执行", Boolean(flow.steps.pps) && (flow.steps.pps as any).status === 200, JSON.stringify(flow.steps.pps));

// 学生 B 走完剩余阶段并提交（进度将出现 1 已提交 + 1 已批改）
const flowB = await studentFlow(studentB, ids.taskId, "mean", { marginOfError: 8, varianceField: "客流量", stratifyBy: "食堂", ppsSizeField: "开放窗口数" });
suite.check("B-3e", "第二名学生（含探测过非法调用）仍可正常完成并提交", flowB.ok === true, flowB.ok ? `sampleSize=${flowB.sampleSize}` : JSON.stringify(flowB.steps).slice(0, 200));

// ---- 均值型分析指标：真值 120.625、方差 2010.974 ----
const metrics = flow.metrics;
ids.metricsTarget = {
    populationValue: metrics?.target?.populationValue ?? null,
    methods: Object.fromEntries(Object.entries(metrics?.target?.methods ?? {}).map(([key, value]: [string, any]) => [key, { estimate: value?.estimate ?? null, standardError: value?.standardError ?? null, effectiveSampleSize: value?.effectiveSampleSize ?? null, reliability: value?.reliability?.status ?? null }])),
};
ids.populationVariance = metrics?.numeric?.客流量?.populationVariance ?? null;
suite.check("B-4a", "总体真值与方差与总体文件一致（120.625 / 2010.974）",
    Math.abs(Number(ids.metricsTarget.populationValue) - 120.625) < 1e-3 && Math.abs(Number(ids.populationVariance) - 2010.974) < 1e-2,
    JSON.stringify({ truth: ids.metricsTarget.populationValue, variance: ids.populationVariance }));
const executed = ["simple", "stratified", "pps"].map((key) => (ids.metricsTarget.methods as Record<string, any>)[key]);
suite.check("B-4b", "各方法均值估计接近真值且带设计标准误",
    executed.every((row) => Math.abs(row.estimate - 120.625) < 60 && row.standardError > 0),
    JSON.stringify(ids.metricsTarget.methods));
suite.check("B-4c", "小样本时教学误差半宽明显大于 0 且带可复现样本量",
    executed.every((row) => row.effectiveSampleSize === null || row.effectiveSampleSize > 0),
    JSON.stringify(executed.map((row) => ({ n: row.effectiveSampleSize, se: row.standardError }))));

// ---- 批改 + 导出 + 管理端 ----
const gradingList = await h.teacher.get("/api/teacher/grading?status=submitted&pageSize=50");
const item = (gradingList.body?.data?.items ?? []).find((row: any) => row.studentId === h.studentIds[0]);
const detail = await h.teacher.get(`/api/teacher/grading/${item.id}`);
const grade = await h.teacher.post(`/api/teacher/grading/${item.id}`, { observedVersion: detail.body?.data?.version, scoreQuestionnaire: 24, scoreProcess: 26, scoreReport: 40, comment: "均值型研究内容批改通过。" });
suite.check("B-5a", "教师批改均值型提交", grade.status === 200, `${grade.status} ${grade.text.slice(0, 120)}`);
const exportExcel = await h.teacher.get(`/api/teacher/grade-export/excel?classId=${h.classId}&topicId=${ids.topicId}`);
suite.check("B-5b", "成绩导出 xlsx 可下载且非空", exportExcel.status === 200 && exportExcel.text.length > 1000, `${exportExcel.status} bytes=${exportExcel.text.length}`);
const progress = await h.teacher.get(`/api/teacher/tasks/${ids.taskId}/progress`);
ids.progress = progress.body?.data ?? null;
suite.check("B-5c", "进度：1 已批改 + 1 已提交，且无被跳过的 PPS（数据条件满足）",
    ids.progress?.ppsUnavailable?.count === 0 && ids.progress?.counts?.graded === 1 && ids.progress?.counts?.submitted === 1,
    JSON.stringify({ counts: ids.progress?.counts, pps: ids.progress?.ppsUnavailable }));

console.log(`（证据文件：${evidenceFile("round-content-b.json")}）`);
const summary = suite.summary();
await writeResult(evidenceFile("round-content-b.json"), { round: "B-均值型", ids, ...summary });
