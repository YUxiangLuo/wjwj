// 联动测试公共流程：从零建教师/班级/学生 → 上传总体建模板 → 发布任务 → 学生走完四阶段。
// 供 scripts/integration/round-content-*.ts 复用。
import { Client, csv, formFile } from "./lib";
import { calculateMeanEstimationSampleSize, calculateFinitePopulationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

export interface Handles {
    admin: Client;
    teacher: Client;
    employeeId: string;
    classId: number;
    students: Record<string, Client>;
    studentIds: string[];
}

export function formFileFromPath(field: string, path: string, filename: string) {
    const form = new FormData();
    form.append(field, Bun.file(path), filename);
    return form;
}

/** 建学期/教师/班级并导入学生，返回各端已登录的客户端。 */
export async function bootstrap(input: {
    stamp: string;
    teacherName: string;
    className: string;
    semesterPrefix: string;
    studentNames: string[];
}): Promise<Handles> {
    const admin = new Client("admin");
    await admin.login("/api/admin/login", { username: "admin", password: "admin123" });
    const semesterId = (await admin.post("/api/admin/semesters", { name: `${input.semesterPrefix}${input.stamp}`, setAsCurrent: false })).body?.data?.id;
    const employeeId = `T5${input.stamp}`;
    const teacherId = (await admin.post("/api/admin/teachers", { employeeId, name: input.teacherName })).body?.data?.id;
    const classId = (await admin.post("/api/admin/classes", { name: `${input.className}${input.stamp}`, semesterId: Number(semesterId), teacherId: Number(teacherId) })).body?.data?.id;

    const teacher = new Client("teacher");
    await teacher.login("/api/teacher/login", { employeeId, password: employeeId });

    const studentIds = input.studentNames.map((_, index) => `S5${input.stamp}${String.fromCharCode(65 + index)}`);
    const rows = studentIds.map((studentId, index) => [studentId, input.studentNames[index]!]);
    await teacher.post(`/api/teacher/classes/${classId}/students/import`, formFile("students.csv", csv(["学号", "姓名"], rows)));

    const students: Record<string, Client> = {};
    for (const studentId of studentIds) {
        const client = new Client(`student-${studentId}`);
        await client.login("/api/student/login", { studentId, password: studentId });
        students[studentId] = client;
    }
    return { admin, teacher, employeeId, classId: Number(classId), students, studentIds };
}

/** 用仓库里的总体文件建模板并保存映射（不发布）。 */
export async function createTopic(input: {
    teacher: Client;
    name: string;
    storagePath: string;
    mapping: Record<string, unknown>;
    weights?: Record<string, number>;
}) {
    const topicId = (await input.teacher.post("/api/teacher/topics", { name: input.name })).body?.data?.id;
    const upload = await input.teacher.post(`/api/teacher/topics/${topicId}/excel`, formFileFromPath("file", input.storagePath, input.storagePath.split("/").pop()!));
    const mapping = await input.teacher.put(`/api/teacher/topics/${topicId}/mapping`, { fieldMapping: input.mapping });
    const weights = await input.teacher.put(`/api/teacher/topics/${topicId}/weights`, { weightConfig: input.weights ?? { questionnaire: 30, process: 30, report: 40 } });
    const policy = (await input.teacher.get(`/api/teacher/topics/${topicId}/detail`)).body?.data?.topic?.samplingPolicy ?? null;
    return { topicId: Number(topicId), upload, mapping, weights, policy };
}

/** 发布模板并给班级发任务，返回新任务 ID。 */
export async function publishAndAssign(input: {
    teacher: Client;
    topicId: number;
    topicName: string;
    classId: number;
    deadlineDays?: number;
}) {
    const publish = await input.teacher.put(`/api/teacher/topics/${input.topicId}`, { name: input.topicName, status: 1 });
    const task = await input.teacher.post("/api/teacher/tasks", {
        topicId: input.topicId,
        classIds: [input.classId],
        deadline: new Date(Date.now() + (input.deadlineDays ?? 4) * 86400000).toISOString(),
    });
    const list = await input.teacher.get("/api/teacher/tasks");
    const rows = Array.isArray(list.body?.data) ? list.body.data : list.body?.data?.items ?? [];
    const taskId = rows.find((row: any) => row.topicId === input.topicId && row.classId === input.classId)?.id;
    return { publish, task, taskId: Number(taskId) };
}

export const QUESTIONNAIRE = {
    title: "研究内容联动问卷",
    welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
    endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
    questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single" as const, content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
};

export const REPORT_HTML = [
    "<h2>研究内容与目标</h2><p>本次实验针对既定研究内容，明确分析单位、目标总体与估计量，并在报告中记录规划参数与抽样设计，保证结论可以被复核。</p>",
    "<h2>抽样设计</h2><p>样本量由置信水平、允许误差、总体方差或保守比例方差共同决定，并考虑有限总体校正、设计效应与无回答率，按可执行方法完成抽样。</p>",
    "<h2>结果与推断</h2><p>给出点估计、设计标准误与教学误差半宽，并与总体真值对照，说明不同抽样方法的样本构成差异与效率差异。</p>",
    "<h2>结论与限制</h2><p>如实说明数据条件限制（例如规模变量不满足正值条件时不使用 PPS），不把样本差异解释为因果效应。</p>",
].join("");

/** 按学生端算法规划样本量：均值用总体方差，比例用保守方差 0.25。 */
export function planSampleSize(kind: "mean" | "proportion", populationSize: number, params: { marginOfError: number; variance?: number | null }) {
    const bounds = getFinalSampleSizeBounds(populationSize);
    const recommended = kind === "mean"
        ? calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: params.marginOfError,
            populationSize,
            populationVariance: params.variance ?? 0,
            designEffect: 1,
            nonResponseRate: 0,
        })
        : calculateFinitePopulationSampleSize({
            confidenceLevel: "95",
            marginOfError: params.marginOfError,
            populationSize,
            designEffect: 1,
            nonResponseRate: 0,
        });
    const finalSampleSize = Math.min(Math.max(recommended ?? bounds.min, bounds.min), bounds.max);
    return {
        bounds,
        plan: {
            estimationType: kind,
            confidenceLevel: "95",
            marginOfError: params.marginOfError,
            populationVariance: kind === "mean" ? params.variance : undefined,
            designEffect: 1,
            nonResponseRate: 0,
            recommendedSize: recommended,
            finalSampleSize,
        },
    };
}

export interface StudentFlowOptions {
    questionnaire?: typeof QUESTIONNAIRE;
    report?: string;
    marginOfError: number;
    /** 均值目标字段（用于取总体方差）。 */
    varianceField?: string;
    /** 分层抽样参数；不给则按 mapping 的分层字段做等分。 */
    stratifyBy?: string;
    /** PPS 规模字段；启用时必填。 */
    ppsSizeField?: string;
    /** 只推进到某一阶段（默认 4）。 */
    untilStage?: number;
    /** 只完成阶段 1、2 就返回（用于在抽样前做接口探测）。 */
    stopAfterStage2?: boolean;
    /** 覆盖最终样本量（必须落在平台给出的上界内），用于探测普查等边界。 */
    finalSampleSize?: number;
    /** 完成阶段 4 但不提交（用于查看分析页）。 */
    stopBeforeSubmit?: boolean;
}

/** 学生走阶段 1–4（按模板策略选择方法），可选提交。 */
export async function studentFlow(student: Client, taskId: number, kind: "mean" | "proportion", options: StudentFlowOptions) {
    const until = options.untilStage ?? 4;
    const steps: Record<string, unknown> = {};
    let exp = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
    steps.startStage = exp?.currentStage;
    if (!exp) return { ok: false as const, steps, error: "实验记录不存在" };

    if (exp.currentStage === 1 && until >= 2) {
        const stage1 = await student.post(`/api/student/tasks/${taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire: options.questionnaire ?? QUESTIONNAIRE });
        if (stage1.status !== 200) return { ok: false as const, steps, error: { stage: 1, body: stage1.body } };
        exp = stage1.body.data;
    }
    const stats = (await student.get(`/api/student/tasks/${taskId}/stats`)).body?.data;
    const populationSize = exp.populationSize ?? 0;
    if (exp.currentStage === 2 && until >= 3) {
        const varianceField = options.varianceField ?? Object.keys(stats?.populationNumericStats ?? {})[0];
        const variance = varianceField ? stats?.populationNumericStats?.[varianceField]?.variance ?? null : null;
        const { plan, bounds } = planSampleSize(kind, populationSize, { marginOfError: options.marginOfError, variance });
        if (options.finalSampleSize) plan.finalSampleSize = options.finalSampleSize;
        steps.plan = { plan, bounds, varianceField, variance };
        const stage2 = await student.post(`/api/student/tasks/${taskId}/experiment/stages/2/complete`, { observedVersion: exp.version, samplePlan: plan });
        if (stage2.status !== 200) return { ok: false as const, steps, error: { stage: 2, body: stage2.body } };
        exp = stage2.body.data;
    }
    if (options.stopAfterStage2) return { ok: true as const, steps, experiment: exp, sampleSize: exp.samplePlan?.finalSampleSize ?? 0, experimentId: null, metrics: null };
    const sampleSize = exp.samplePlan?.finalSampleSize ?? 1;
    const policy = exp.samplingPolicy?.methods ?? {};

    if (!exp.samplingResults?.simple?.completed && until >= 3) {
        const simple = await student.post(`/api/student/tasks/${taskId}/sampling`, { method: "simple", params: { seed: 101, sampleSize } });
        if (simple.status !== 200) return { ok: false as const, steps, error: { stage: "simple", body: simple.body } };
    }
    // 第二种方法：优先分层（映射里声明了分层字段时），否则系统抽样
    if (!exp.samplingResults?.stratified?.completed && policy.stratified !== "disabled" && until >= 3) {
        const field = options.stratifyBy ?? (stats?.categoricalFields ?? [])[0];
        if (field) {
            const rows = await student.get(`/api/student/tasks/${taskId}/stats`);
            const values: Record<string, number> = rows.body?.data?.categoricalStats?.[field] ?? {};
            const total = Object.values(values).reduce((sum, value) => sum + value, 0);
            let assigned = 0;
            const names = Object.keys(values);
            const layers = names.map((name, index) => {
                const exact = (values[name]! / total) * sampleSize;
                const allocated = index === names.length - 1 ? Math.max(1, sampleSize - assigned) : Math.max(1, Math.round(exact));
                assigned += allocated;
                return { name, sampleCount: allocated };
            });
            steps.stratifyBy = field;
            steps.layers = layers;
            const stratified = await student.post(`/api/student/tasks/${taskId}/sampling`, { method: "stratified", params: { seed: 102, sampleSize, stratifyBy: field, layers } });
            if (stratified.status !== 200) return { ok: false as const, steps, error: { stage: "stratified", body: stratified.body } };
        }
    }
    if (policy.pps === "required" || policy.pps === "optional") {
        const refreshed = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
        if (!refreshed.samplingResults?.pps?.completed && !refreshed.samplingResults?.pps?.unavailable && until >= 3) {
            const sizeField = options.ppsSizeField ?? (stats?.ppsEligibleFields ?? [])[0];
            const pps = await student.post(`/api/student/tasks/${taskId}/sampling`, { method: "pps", params: { seed: 103, sampleSize, sizeField } });
            steps.pps = { sizeField, status: pps.status, body: pps.status === 200 ? undefined : pps.body };
            if (pps.status !== 200 && policy.pps === "required") return { ok: false as const, steps, error: { stage: "pps", body: pps.body } };
        }
    }
    exp = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
    if (exp.currentStage === 3 && until >= 4) {
        const stage3 = await student.post(`/api/student/tasks/${taskId}/experiment/stages/3/complete`, { observedVersion: exp.version });
        if (stage3.status !== 200) return { ok: false as const, steps, error: { stage: 3, body: stage3.body } };
        exp = stage3.body.data;
    }
    if (exp.currentStage === 4 && until >= 4) {
        const stage4 = await student.post(`/api/student/tasks/${taskId}/experiment/stages/4/complete`, { observedVersion: exp.version, reportContent: options.report ?? REPORT_HTML });
        if (stage4.status !== 200) return { ok: false as const, steps, error: { stage: 4, body: stage4.body } };
        exp = stage4.body.data;
    }
    if (options.stopBeforeSubmit) {
        const pending = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
        return { ok: true as const, steps, experiment: pending, sampleSize, experimentId: null, metrics: (await student.get(`/api/student/tasks/${taskId}/analysis-metrics`)).body?.data ?? null };
    }
    const submit = await student.post(`/api/student/tasks/${taskId}/submit`, { observedVersion: exp.version });
    steps.submitStatus = submit.status;
    steps.submitBody = submit.status === 200 ? undefined : submit.body;
    const finalExperiment = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
    return {
        ok: submit.status === 200,
        steps,
        sampleSize,
        experiment: finalExperiment,
        experimentId: submit.body?.data?.experimentId,
        metrics: (await student.get(`/api/student/tasks/${taskId}/analysis-metrics`)).body?.data ?? null,
    };
}
