import { and, asc, count, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../index";
import {
    admin,
    announcement,
    class_,
    experiment,
    samplingAttempt,
    semester,
    student,
    task,
    teacher,
    topic,
    topicAttachment,
} from "../schema";
import { parseSpreadsheetFile } from "../../lib/spreadsheet";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize, finitePopulationS2ToSigma2 } from "../../student/experiment/sample-plan";
import { resolveStoragePath } from "../../server/storage-files";
import { buildPopulationNumericStats, getPpsEligibleNumericFields, parseTopicFieldMapping } from "@/domain/statistics/population";
import { validateQuestionnaireForSubmit, validateReportForSubmit, validateSamplePlanForSubmit } from "../../student/experiment/submit-validation";
import { buildTaskProgressSnapshot } from "../../teacher/topic/task-progress";
import {
    computeYouthHappinessPlan,
    DINING_PPS_SIZE_FIELD,
    DINING_POPULATION_PATH,
    DOGFOOD_ANCHORS,
    DOGFOOD_COUNTS,
    DOGFOOD_MAIN_TASK_PROGRESS,
    DOGFOOD_NAMES,
    EMPLOYMENT_POPULATION_PATH,
    GREEN_COMMUTE_POPULATION_PATH,
    GUIDE_ATTACHMENT_PATH,
    HAPPINESS_POPULATION_PATH,
    QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH,
    READING_POPULATION_PATH,
} from "./dogfood-fixtures";
import { DEMO_STUDENT_ACCOUNTS } from "./demo-accounts";
import { filterPpsEligibleFields, parseSamplingPolicy } from "../../lib/sampling-policy";
import { validateRecommendQuestionsPayload } from "../../lib/validate-question";

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function stableJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(normalize);
        if (!input || typeof input !== "object") return input;
        return Object.fromEntries(
            Object.entries(input as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, normalize(nested)]),
        );
    };
    return JSON.stringify(normalize(value));
}

async function rowCount(table: typeof admin | typeof teacher | typeof semester | typeof class_ | typeof student | typeof topic | typeof task | typeof experiment | typeof samplingAttempt | typeof announcement | typeof topicAttachment) {
    const [row] = await db.select({ value: count() }).from(table as typeof admin);
    return row?.value ?? 0;
}

async function verify() {
    const actualCounts = {
        admin: await rowCount(admin),
        teacher: await rowCount(teacher),
        semester: await rowCount(semester),
        class: await rowCount(class_),
        student: await rowCount(student),
        topic: await rowCount(topic),
        task: await rowCount(task),
        experiment: await rowCount(experiment),
        samplingAttempt: await rowCount(samplingAttempt),
        announcement: await rowCount(announcement),
        topicAttachment: await rowCount(topicAttachment),
    };
    for (const [name, expected] of Object.entries(DOGFOOD_COUNTS)) {
        check(actualCounts[name as keyof typeof actualCounts] === expected, `${name} count: expected ${expected}, got ${actualCounts[name as keyof typeof actualCounts]}`);
    }

    const [aTask] = await db
        .select({ id: task.id, classId: task.classId })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(eq(topic.name, DOGFOOD_NAMES.topicA));
    check(aTask, "Active A task is missing");

    const progressRows = await db
        .select({
            studentId: student.studentId,
            name: student.name,
            experimentId: experiment.id,
            currentStage: experiment.currentStage,
            experimentStatus: experiment.status,
            lastActivity: experiment.updatedAt,
        })
        .from(student)
        .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, aTask.id)))
        .where(eq(student.classId, aTask.classId))
        .orderBy(asc(student.studentId));
    const progress = buildTaskProgressSnapshot(progressRows);
    const expectedProgress = DOGFOOD_MAIN_TASK_PROGRESS;
    check(JSON.stringify(progress.counts) === JSON.stringify(expectedProgress), `A progress buckets differ: ${JSON.stringify(progress.counts)}`);

    const teacherCredentialRows = await db.select({
        employeeId: teacher.employeeId,
        password: teacher.password,
    }).from(teacher);
    for (const row of teacherCredentialRows) {
        check(await Bun.password.verify(row.employeeId, row.password), `${row.employeeId} demo password differs`);
    }

    const allStudentRows = await db
        .select({
            studentId: student.studentId,
            name: student.name,
            password: student.password,
            className: class_.name,
        })
        .from(student)
        .innerJoin(class_, eq(student.classId, class_.id));
    for (const row of allStudentRows) {
        check(await Bun.password.verify(row.studentId, row.password), `${row.studentId} demo password differs`);
    }
    const demoStudentRows = allStudentRows.filter((row) => (
        DEMO_STUDENT_ACCOUNTS.some((account) => account.studentId === row.studentId)
    ));
    check(demoStudentRows.length === DEMO_STUDENT_ACCOUNTS.length, `Demo student count differs: ${demoStudentRows.length}`);
    for (const account of DEMO_STUDENT_ACCOUNTS) {
        const row = demoStudentRows.find((candidate) => candidate.studentId === account.studentId);
        check(row?.name === account.name, `${account.studentId} demo name differs`);
        check(row.className === DOGFOOD_NAMES.mainClass, `${account.studentId} is outside the demo class`);
    }

    const authoritative = await db
        .select({
            studentId: student.studentId,
            studentName: student.name,
            topicName: topic.name,
            populationPath: topic.excelFilePath,
            populationSize: topic.excelRowCount,
            fieldMapping: topic.fieldMapping,
            weightConfig: topic.weightConfig,
            samplingPolicy: topic.samplingPolicy,
            currentStage: experiment.currentStage,
            status: experiment.status,
            questionnaire: experiment.questionnaire,
            results: experiment.samplingResults,
            reportContent: experiment.reportContent,
            snapshot: experiment.submissionSnapshot,
            samplePlan: experiment.samplePlan,
        })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(eq(experiment.currentStage, 4));
    // 13 份完成全部四阶段的实验：主任务 4、阅读 1、比例 2、服务时段 3、绿色通勤 1、历史归档 2。
    check(authoritative.length === 13, `Expected 13 stage4/terminal authoritative fixtures, got ${authoritative.length}`);

    function checkAuthoritativeMethods(label: string, value: unknown, ppsDisabled: boolean, allowChoicePair = false) {
        const results = value as Record<string, Record<string, unknown> | undefined> | null;
        const expectedMethods = allowChoicePair
            ? (["simple", "systematic"] as const)
            : ppsDisabled
                ? (["simple", "systematic", "stratified"] as const)
                : (["simple", "systematic", "pps", "stratified"] as const);
        for (const method of expectedMethods) {
            check(results?.[method]?.serverGenerated === true, `${label}/${method} is not server generated`);
        }
        if (allowChoicePair) {
            check(!results?.pps && !results?.stratified, `${label} must contain only the selected method pair`);
        }
        for (const method of expectedMethods.filter((method) => method !== "pps")) {
            const section = results?.[method];
            check(!Array.isArray(section?.data), `${label}/${method} unexpectedly embeds sampled rows`);
            check(Array.isArray(section?.indices) && section.indices.length === section.sampleCount, `${label}/${method} has invalid replay indices`);
        }
        if (allowChoicePair || ppsDisabled) {
            check(!results?.pps, `${label} must not contain a disabled PPS result`);
            return results;
        }
        const pps = results?.pps;
        check(pps?.completed === true && pps.unavailable !== true, `${label}/pps is not a completed result`);
        check(!Array.isArray(pps.data), `${label}/pps unexpectedly embeds sampled rows`);
        check(Array.isArray(pps.indices) && pps.indices.length === pps.sampleCount, `${label}/pps has invalid replay indices`);
        check(Array.isArray(pps.inclusionProbabilities) && pps.inclusionProbabilities.length === pps.sampleCount, `${label}/pps probabilities differ from its sample count`);
        return results;
    }

    const populationHashCache = new Map<string, string>();
    for (const row of authoritative) {
        const label = `${row.studentId}/${row.topicName}`;
        const hasDisabledPps = row.topicName === DOGFOOD_NAMES.topicA
            || row.topicName === DOGFOOD_NAMES.topicB
            || row.topicName === DOGFOOD_NAMES.topicC
            || row.topicName === DOGFOOD_NAMES.topicE;
        const hasChoicePair = row.studentId === DOGFOOD_ANCHORS.choicePair && row.topicName === DOGFOOD_NAMES.topicA;
        const liveResults = checkAuthoritativeMethods(label, row.results, hasDisabledPps, hasChoicePair);
        if (row.status !== "in_progress") {
            const storedSnapshot = row.snapshot as Record<string, unknown> | null;
            check(storedSnapshot, `${label} has no submission snapshot`);
            const snapshotResults = checkAuthoritativeMethods(`${label}/snapshot`, storedSnapshot.samplingResults, hasDisabledPps, hasChoicePair);
            check(stableJson(snapshotResults) === stableJson(liveResults), `${label} snapshot sampling results differ from the live record`);
            check(stableJson(storedSnapshot.questionnaire) === stableJson(row.questionnaire), `${label} snapshot questionnaire differs from the live record`);
            check(stableJson(storedSnapshot.samplePlan) === stableJson(row.samplePlan), `${label} snapshot sample plan differs from the live record`);
            check(stableJson(storedSnapshot.weightConfig) === stableJson(row.weightConfig), `${label} snapshot scoring weights differ from the topic`);
            check(stableJson(storedSnapshot.samplingPolicy) === stableJson(row.samplingPolicy), `${label} snapshot sampling policy differs from the topic`);
            check(storedSnapshot.populationSize === row.populationSize, `${label} snapshot population size differs from the topic`);
            check(storedSnapshot.topicName === row.topicName, `${label} snapshot topic name differs`);
            check(storedSnapshot.studentName === row.studentName, `${label} snapshot student name differs`);
            check(storedSnapshot.reportContent === row.reportContent, `${label} snapshot report differs from the live record`);
            check(typeof row.populationPath === "string" && row.populationPath.length > 0, `${label} has no population file`);
            let populationHash = populationHashCache.get(row.populationPath);
            if (!populationHash) {
                const file = Bun.file(resolveStoragePath(row.populationPath));
                check(await file.exists(), `${label} population file is missing: ${row.populationPath}`);
                populationHash = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
                populationHashCache.set(row.populationPath, populationHash);
            }
            check(
                typeof storedSnapshot.populationFileSha256 === "string" && /^[a-f0-9]{64}$/.test(storedSnapshot.populationFileSha256),
                `${label} snapshot population hash is invalid`,
            );
            check(storedSnapshot.populationFileSha256 === populationHash, `${label} snapshot population hash differs from the source file`);
            check(storedSnapshot.parserVersion === "raw-values-v1", `${label} snapshot parser version differs`);
            check(storedSnapshot.samplingAlgorithmVersion === "sampling-v2", `${label} snapshot sampling algorithm version differs`);
            check(validateQuestionnaireForSubmit(storedSnapshot.questionnaire) === null, `${label} snapshot questionnaire is invalid`);
            check(validateSamplePlanForSubmit(storedSnapshot.samplePlan, row.populationSize) === null, `${label} snapshot sample plan is invalid`);
            check(validateReportForSubmit(row.reportContent) === null, `${label} live report is invalid`);
            check(validateReportForSubmit(storedSnapshot.reportContent) === null, `${label} snapshot report is invalid`);
        }
        if (hasDisabledPps && row.status !== "in_progress") {
            const explainsDisabledPps = (value: unknown) => typeof value === "string"
                && value.includes("PPS")
                && ["不适用", "不使用", "不用于"].some((phrase) => value.includes(phrase));
            check(explainsDisabledPps(row.reportContent), `${label} live report does not explain disabled PPS`);
            const snapshotReport = (row.snapshot as Record<string, unknown> | null)?.reportContent;
            check(explainsDisabledPps(snapshotReport), `${label} snapshot report does not explain disabled PPS`);
        }
    }
    check(
        authoritative.filter((row) => row.studentId === DOGFOOD_ANCHORS.submitted && row.topicName === DOGFOOD_NAMES.topicB).length === 1,
        "Expected exactly one mean PPS-disabled fixture",
    );

    const auditRows = await db
        .select({ method: samplingAttempt.method, seed: samplingAttempt.seed, sampleCount: samplingAttempt.sampleCount })
        .from(samplingAttempt)
        .innerJoin(experiment, eq(samplingAttempt.experimentId, experiment.id))
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(eq(student.studentId, DOGFOOD_ANCHORS.submitted), eq(topic.name, DOGFOOD_NAMES.topicA)))
        .orderBy(asc(samplingAttempt.createdAt));
    const { recommendedSize: expectedPpsSampleCount } = computeYouthHappinessPlan();
    check(JSON.stringify(auditRows) === JSON.stringify([
        { method: "simple", seed: 202601, sampleCount: expectedPpsSampleCount },
        { method: "systematic", seed: 202602, sampleCount: expectedPpsSampleCount },
        { method: "stratified", seed: 202604, sampleCount: expectedPpsSampleCount },
    ]), `Sampling attempt fixtures differ: ${JSON.stringify(auditRows)}`);

    const auditCoverage = await db
        .select({
            studentId: student.studentId,
            topicName: topic.name,
            method: samplingAttempt.method,
            seed: samplingAttempt.seed,
            sampleCount: samplingAttempt.sampleCount,
            details: samplingAttempt.details,
        })
        .from(samplingAttempt)
        .innerJoin(experiment, eq(samplingAttempt.experimentId, experiment.id))
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .orderBy(asc(student.studentId), asc(topic.name), asc(samplingAttempt.method));
    const auditedScenarioKeys = new Set(auditCoverage.map((row) => `${row.studentId}|${row.topicName}`));
    check(auditCoverage.length === DOGFOOD_COUNTS.samplingAttempt, `Sampling audit coverage differs: ${auditCoverage.length}`);
    check(auditedScenarioKeys.size === 4, `Expected four audited research scenarios, got ${[...auditedScenarioKeys].join(", ")}`);
    for (const key of auditedScenarioKeys) {
        const expectedMethods = key.endsWith(`|${DOGFOOD_NAMES.topicD}`) ? 4 : 3;
        check(auditCoverage.filter((row) => `${row.studentId}|${row.topicName}` === key).length === expectedMethods, `${key} does not cover ${expectedMethods} sampling methods`);
    }
    for (const attempt of auditCoverage) {
        const source = authoritative.find((row) => row.studentId === attempt.studentId && row.topicName === attempt.topicName);
        const result = (source?.results as Record<string, Record<string, unknown> | undefined> | null)?.[attempt.method];
        check(result, `${attempt.studentId}/${attempt.topicName}/${attempt.method} has no authoritative result`);
        const {
            data: _data,
            indices: _indices,
            inclusionProbabilities: _inclusionProbabilities,
            serverGenerated: _serverGenerated,
            seed: expectedSeed,
            sampleCount: expectedSampleCount,
            ...expectedDetails
        } = result;
        check(attempt.seed === expectedSeed, `${attempt.studentId}/${attempt.topicName}/${attempt.method} audit seed differs`);
        check(attempt.sampleCount === expectedSampleCount, `${attempt.studentId}/${attempt.topicName}/${attempt.method} audit sample count differs`);
        check(stableJson(attempt.details) === stableJson(expectedDetails), `${attempt.studentId}/${attempt.topicName}/${attempt.method} audit details differ`);
        if (attempt.topicName === DOGFOOD_NAMES.topicD && attempt.method === "pps") {
            check(expectedDetails.sizeField === "历史同期客流量", `${attempt.studentId}/${attempt.topicName}/pps does not use the prior-frame size measure`);
        }
        if (attempt.topicName === DOGFOOD_NAMES.topicE && attempt.method === "systematic") {
            check(expectedDetails.interval === 4, `${attempt.studentId}/${attempt.topicName}/systematic does not preserve the designed K=4 periodicity`);
        }
    }

    const visible = await db
        .select({ studentId: student.studentId, topicName: topic.name })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(
            eq(class_.teacherId, (await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.employeeId, "T001")))[0]!.id),
            eq(student.classId, task.classId),
            inArray(experiment.status, ["submitted", "graded", "rejected"]),
        ));
    const visibleKeys = visible.map((row) => `${row.studentId}|${row.topicName}`).sort();
    const expectedVisible = [
        `${DOGFOOD_ANCHORS.submitted}|${DOGFOOD_NAMES.topicA}`,
        `${DOGFOOD_ANCHORS.submitted}|${DOGFOOD_NAMES.topicB}`,
        `${DOGFOOD_ANCHORS.submitted}|${DOGFOOD_NAMES.topicC}`,
        `${DOGFOOD_ANCHORS.submitted}|${DOGFOOD_NAMES.topicE}`,
        `${DOGFOOD_ANCHORS.graded}|${DOGFOOD_NAMES.topicA}`,
        `${DOGFOOD_ANCHORS.graded}|${DOGFOOD_NAMES.topicC}`,
        `${DOGFOOD_ANCHORS.rejected}|${DOGFOOD_NAMES.topicA}`,
        `${DOGFOOD_ANCHORS.auditedSecondary}|${DOGFOOD_NAMES.topicD}`,
        `P2603|${DOGFOOD_NAMES.topicD}`,
        `P2604|${DOGFOOD_NAMES.topicD}`,
    ].sort();
    check(JSON.stringify(visibleKeys) === JSON.stringify(expectedVisible), `Visible grading fixtures differ: ${JSON.stringify(visibleKeys)}`);

    // The seeded plans must agree with the seeded populations: a hardcoded
    // variance used to disagree with the generated file and no gate noticed.
    const planRows = authoritative.filter((row) => row.samplePlan && typeof row.samplePlan === "object");
    check(planRows.length > 0, "No authoritative experiment carries a sample plan");
    const planPopulationCache = new Map<string, ReturnType<typeof parseSpreadsheetFile> extends Promise<infer T> ? T : never>();
    for (const row of planRows) {
        const plan = row.samplePlan as Record<string, unknown>;
        const [storedTopic] = await db
            .select({ path: topic.excelFilePath, mapping: topic.fieldMapping })
            .from(topic)
            .where(eq(topic.name, row.topicName));
        check(storedTopic?.path, `${row.topicName} has no population file for its sample plan`);
        let parsed = planPopulationCache.get(storedTopic.path);
        if (!parsed) {
            const file = Bun.file(resolveStoragePath(storedTopic.path));
            parsed = await parseSpreadsheetFile(await file.arrayBuffer(), storedTopic.path);
            planPopulationCache.set(storedTopic.path, parsed);
        }
        const mapping = parseTopicFieldMapping(storedTopic.mapping);
        const targetField = mapping?.analysisTarget?.field;
        check(targetField, `${row.topicName} sample plan target field is missing`);
        const label = `${row.studentId}/${row.topicName} sample plan`;
        const populationSize = parsed.rowCount;

        if (plan.estimationType === "mean") {
            // Reuse the production helper so the check cannot invent a third convention.
            const stats = buildPopulationNumericStats(parsed.rows, [targetField])[targetField];
            check(stats && stats.count > 1, `${row.topicName} sample plan target has no numeric rows`);
            const populationVariance = finitePopulationS2ToSigma2(stats.variance, stats.count);
            check(populationVariance !== null, `${row.topicName} sample plan variance could not be converted`);
            const storedVariance = Number(plan.populationVariance);
            check(Number.isFinite(storedVariance), `${label} has no population variance`);
            check(
                Math.abs(storedVariance - populationVariance) < 1e-6,
                `${label} variance differs from the population file: stored=${storedVariance} file=${populationVariance}`,
            );
            const expectedSize = calculateMeanEstimationSampleSize({
                confidenceLevel: String(plan.confidenceLevel) as "95",
                marginOfError: Number(plan.marginOfError),
                populationSize,
                populationVariance,
                designEffect: Number(plan.designEffect ?? 1),
                nonResponseRate: Number(plan.nonResponseRate ?? 0),
            });
            check(expectedSize !== null, `${label} could not be recomputed`);
            check(
                Number(plan.recommendedSize) === expectedSize,
                `${label} recommended size differs from the population file: stored=${plan.recommendedSize} expected=${expectedSize}`,
            );
        } else {
            const expectedSize = calculateFinitePopulationSampleSize({
                confidenceLevel: String(plan.confidenceLevel) as "95",
                marginOfError: Number(plan.marginOfError),
                populationSize,
                designEffect: Number(plan.designEffect ?? 1),
                nonResponseRate: Number(plan.nonResponseRate ?? 0),
            });
            check(expectedSize !== null, `${label} could not be recomputed`);
            check(
                Number(plan.recommendedSize) === expectedSize,
                `${label} recommended size differs from the population file: stored=${plan.recommendedSize} expected=${expectedSize}`,
            );
        }
        check(
            Number(plan.finalSampleSize) >= Number(plan.recommendedSize) && Number(plan.finalSampleSize) <= populationSize,
            `${label} final sample size is out of range`,
        );
    }

    const storedTopics = await db
        .select({
            name: topic.name,
            status: topic.status,
            path: topic.excelFilePath,
            rowCount: topic.excelRowCount,
            fieldMapping: topic.fieldMapping,
            samplingPolicy: topic.samplingPolicy,
            recommendQuestions: topic.recommendQuestions,
        })
        .from(topic)
        .where(inArray(topic.name, [DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.topicB, DOGFOOD_NAMES.topicC, DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.topicE]));
    check(storedTopics.length === 5, `Expected stored population metadata for five research scenarios, got ${storedTopics.length}`);

    const expectedTopicFiles = {
        [DOGFOOD_NAMES.topicA]: {
            path: HAPPINESS_POPULATION_PATH,
            rowCount: 240,
            columns: ["青年代号", "年龄组", "居住地类型", "当前状态", "生活幸福感得分", "社会支持感", "自评健康", "经济压力"],
            ppsFields: ["生活幸福感得分", "社会支持感", "自评健康", "经济压力"],
            targetKind: "mean",
            targetValue: undefined,
            targetQuestion: { id: "hq2", type: "numeric", unit: "分" },
            policy: { pps: "disabled", stratified: "required", systematic: "optional" },
        },
        [DOGFOOD_NAMES.topicB]: {
            path: READING_POPULATION_PATH,
            rowCount: 24,
            columns: ["编号", "学院", "年级", "每周阅读时长", "是否住宿"],
            ppsFields: [],
            targetKind: "mean",
            targetValue: undefined,
            targetQuestion: { id: "rq1", type: "numeric", unit: "小时" },
            policy: { pps: "disabled", stratified: "optional", systematic: "optional" },
        },
        [DOGFOOD_NAMES.topicC]: {
            path: EMPLOYMENT_POPULATION_PATH,
            rowCount: 160,
            columns: ["样本编号", "学院", "培养层次", "毕业去向意向", "是否有实习经历", "每周职业准备时长", "求职准备度"],
            ppsFields: ["每周职业准备时长", "求职准备度"],
            targetKind: "proportion",
            targetValue: "直接就业",
            targetQuestion: { id: "gq1", type: "single", option: "直接就业" },
            policy: { pps: "disabled", stratified: "required", systematic: "optional" },
        },
        [DOGFOOD_NAMES.topicD]: {
            path: DINING_POPULATION_PATH,
            rowCount: 96,
            columns: ["记录编号", "校区", "食堂", "观测时段", "观测日", "等待分钟", "历史同期客流量", "开放窗口数"],
            ppsFields: ["等待分钟", "历史同期客流量", "开放窗口数"],
            targetKind: "mean",
            targetValue: undefined,
            targetQuestion: { id: "dq4", type: "numeric", unit: "分钟", content: "入队至窗口开始受理" },
            identityQuestions: [
                { id: "dq1", options: ["东校区·学苑食堂", "东校区·风味食堂", "西校区·湖畔食堂", "西校区·清真食堂"] },
                { id: "dq2", options: ["第一周周一", "第一周周二", "第一周周三", "第二周周一", "第二周周二", "第二周周三"] },
                { id: "dq3", options: ["11:30-11:45", "11:45-12:00", "12:00-12:15", "12:15-12:30"] },
            ],
            frameSizeQuestion: { id: "dq5", unit: "人次", numericMin: 1, content: "历史同期客流量" },
            observationCountQuestion: { id: "dq7", unit: "名", numericMin: 0, numericMax: 5 },
            policy: { pps: "required", stratified: "optional", systematic: "optional", ppsSizeFields: [DINING_PPS_SIZE_FIELD] },
        },
        [DOGFOOD_NAMES.topicE]: {
            path: GREEN_COMMUTE_POPULATION_PATH,
            rowCount: 360,
            columns: ["通勤记录编号", "住宿片区", "登记时段", "年级", "是否绿色通勤", "主要通勤方式", "通勤距离公里"],
            ppsFields: ["通勤距离公里"],
            targetKind: "proportion",
            targetValue: "是",
            targetQuestion: { id: "cq2", type: "single", options: ["步行", "自行车", "公共交通", "网约车或私家车"] },
            policy: { pps: "disabled", stratified: "optional", systematic: "required" },
        },
    } as const;
    const parsedRowCounts: Record<string, number> = {};
    for (const storedTopic of storedTopics) {
        const expected = expectedTopicFiles[storedTopic.name as keyof typeof expectedTopicFiles];
        check(expected, `Unexpected topic population metadata: ${storedTopic.name}`);
        check(storedTopic.status === 1, `${storedTopic.name} is not published`);
        check(validateRecommendQuestionsPayload(storedTopic.recommendQuestions) === null, `${storedTopic.name} recommended questionnaire is invalid`);
        const targetQuestion = Array.isArray(storedTopic.recommendQuestions)
            ? (storedTopic.recommendQuestions as Array<Record<string, unknown>>).find((question) => question.id === expected.targetQuestion.id)
            : undefined;
        check(targetQuestion?.type === expected.targetQuestion.type, `${storedTopic.name} recommended questionnaire does not measure its target`);
        if ("unit" in expected.targetQuestion) {
            check(targetQuestion.unit === expected.targetQuestion.unit, `${storedTopic.name} target question unit differs`);
        }
        if ("content" in expected.targetQuestion) {
            check(typeof targetQuestion.content === "string" && targetQuestion.content.includes(expected.targetQuestion.content), `${storedTopic.name} target question lacks its operational measurement rule`);
        }
        if ("option" in expected.targetQuestion) {
            check(Array.isArray(targetQuestion.options) && targetQuestion.options.includes(expected.targetQuestion.option), `${storedTopic.name} target question options differ`);
        }
        if ("options" in expected.targetQuestion) {
            check(stableJson(targetQuestion.options) === stableJson(expected.targetQuestion.options), `${storedTopic.name} target question options differ`);
        }
        if ("identityQuestions" in expected) {
            for (const identity of expected.identityQuestions) {
                const question = (storedTopic.recommendQuestions as Array<Record<string, unknown>>).find((candidate) => candidate.id === identity.id);
                check(question?.type === "single" && stableJson(question.options) === stableJson(identity.options), `${storedTopic.name}/${identity.id} does not identify a valid sampling unit`);
            }
        }
        if ("frameSizeQuestion" in expected) {
            const frameSize = (storedTopic.recommendQuestions as Array<Record<string, unknown>>).find((question) => question.id === expected.frameSizeQuestion.id);
            check(frameSize?.type === "numeric", `${storedTopic.name} prior-frame size question is missing`);
            check(frameSize.unit === expected.frameSizeQuestion.unit && frameSize.numericMin === expected.frameSizeQuestion.numericMin, `${storedTopic.name} prior-frame size question constraints differ`);
            check(typeof frameSize.content === "string" && frameSize.content.includes(expected.frameSizeQuestion.content), `${storedTopic.name} prior-frame size question is not identified as historical`);
        }
        if ("observationCountQuestion" in expected) {
            const countQuestion = (storedTopic.recommendQuestions as Array<Record<string, unknown>>).find((question) => question.id === expected.observationCountQuestion.id);
            check(countQuestion?.type === "numeric", `${storedTopic.name} observation-count question is missing`);
            check(countQuestion.unit === expected.observationCountQuestion.unit
                && countQuestion.numericMin === expected.observationCountQuestion.numericMin
                && countQuestion.numericMax === expected.observationCountQuestion.numericMax, `${storedTopic.name} observation-count constraints differ`);
        }
        check(storedTopic.path === expected.path, `${storedTopic.name} stored path differs: ${storedTopic.path}`);
        check(storedTopic.rowCount === expected.rowCount, `${storedTopic.name} stored row count differs: ${storedTopic.rowCount}`);
        const mapping = parseTopicFieldMapping(storedTopic.fieldMapping);
        check(mapping, `${storedTopic.name} field mapping is invalid`);
        check(mapping?.analysisTarget?.kind === expected.targetKind, `${storedTopic.name} analysis target kind differs`);
        if (mapping?.analysisTarget?.kind === "proportion") {
            check(mapping.analysisTarget.value === expected.targetValue, `${storedTopic.name} analysis target value differs`);
        }
        check(Boolean(mapping?.analysisTarget && "field" in mapping.analysisTarget && mapping.analysisTarget.field), `${storedTopic.name} analysis target field missing`);
        check(mapping?.studyContract?.version === 1, `${storedTopic.name} study contract missing`);
        check(Boolean(mapping?.studyContract?.researchQuestion?.trim()), `${storedTopic.name} study contract research question missing`);
        check(mapping?.studyContract?.target?.field === mapping?.analysisTarget?.field, `${storedTopic.name} study contract target differs from analysis target`);
        const samplingPolicy = parseSamplingPolicy(storedTopic.samplingPolicy);
        check(samplingPolicy, `${storedTopic.name} sampling policy is invalid`);
        check(samplingPolicy.methods.simple === "required", `${storedTopic.name} must require simple sampling`);
        check(samplingPolicy.methods.pps === expected.policy.pps, `${storedTopic.name} PPS policy differs`);
        check(samplingPolicy.methods.stratified === expected.policy.stratified, `${storedTopic.name} stratified policy differs`);
        check(samplingPolicy.methods.systematic === expected.policy.systematic, `${storedTopic.name} systematic policy differs`);
        if ("ppsSizeFields" in expected.policy) {
            check(JSON.stringify(samplingPolicy.ppsSizeFields) === JSON.stringify(expected.policy.ppsSizeFields), `${storedTopic.name} PPS size-field allowlist differs`);
        }

        const file = Bun.file(resolveStoragePath(storedTopic.path));
        check(await file.exists(), `${storedTopic.name} population file is missing: ${storedTopic.path}`);
        check(file.size > 0, `${storedTopic.name} population file is empty: ${storedTopic.path}`);
        const parsed = await parseSpreadsheetFile(await file.arrayBuffer(), storedTopic.path);
        check(parsed.rowCount === storedTopic.rowCount, `${storedTopic.name} parsed row count differs: ${parsed.rowCount}`);
        check(JSON.stringify(parsed.columns) === JSON.stringify(expected.columns), `${storedTopic.name} columns differ: ${JSON.stringify(parsed.columns)}`);
        const eligiblePpsFields = getPpsEligibleNumericFields(parsed.rows, mapping.numeric ?? []);
        check(JSON.stringify(eligiblePpsFields) === JSON.stringify(expected.ppsFields), `${storedTopic.name} PPS eligibility differs: ${JSON.stringify(eligiblePpsFields)}`);
        if (samplingPolicy.methods.pps !== "disabled") {
            const semanticPpsFields = filterPpsEligibleFields(samplingPolicy, eligiblePpsFields)
                .filter((field) => field !== mapping.analysisTarget?.field);
            check(semanticPpsFields.length > 0, `${storedTopic.name} has no policy-approved PPS size field`);
        }
        parsedRowCounts[storedTopic.name] = parsed.rowCount;
    }

    const mainClassTopicRows = await db
        .select({ topicName: topic.name })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(eq(class_.name, DOGFOOD_NAMES.mainClass));
    const mainClassTopicNames = new Set(mainClassTopicRows.map((row) => row.topicName));
    for (const topicName of Object.values(DOGFOOD_NAMES).filter((name) => storedTopics.some((row) => row.name === name))) {
        check(mainClassTopicNames.has(topicName), `${topicName} is not assigned to the main demo class`);
    }

    const attachments = await db
        .select({ path: topicAttachment.filePath, storedSize: topicAttachment.fileSize })
        .from(topicAttachment)
        .innerJoin(topic, eq(topicAttachment.topicId, topic.id))
        .where(eq(topic.name, DOGFOOD_NAMES.topicA));
    check(attachments.length === 2, `Expected two A attachments, got ${attachments.length}`);
    for (const expectedPath of [GUIDE_ATTACHMENT_PATH, QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH]) {
        const storedAttachment = attachments.find((item) => item.path === expectedPath);
        check(storedAttachment, `A attachment stored path is missing: ${expectedPath}`);
        const attachmentFile = Bun.file(resolveStoragePath(storedAttachment.path));
        check(await attachmentFile.exists(), `A attachment is missing: ${storedAttachment.path}`);
        check(attachmentFile.size > 0 && attachmentFile.size === storedAttachment.storedSize, `A attachment size differs: db=${storedAttachment.storedSize} file=${attachmentFile.size}`);
    }

    console.log("Dogfood seed check passed.");
    console.log(`Counts: ${Object.entries(actualCounts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log(`A progress: ${Object.entries(progress.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log(`Visible grading fixtures: ${visibleKeys.join(", ")}`);
    console.log(`Authoritative compact stage4/terminal fixtures: ${authoritative.length}; sampling attempts: ${auditCoverage.length}; population rows: ${storedTopics.map((row) => `${row.name}=${parsedRowCounts[row.name]}`).join(", ")}`);
}

try {
    await verify();
} catch (error) {
    console.error("Dogfood seed check failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
