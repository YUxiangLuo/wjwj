import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
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
import { resolveStoragePath } from "../../server/storage-files";
import { getPpsEligibleNumericFields, parseTopicFieldMapping } from "../../student/experiment/population-data";
import { validateReportForSubmit } from "../../student/experiment/submit-validation";
import { buildTaskProgressSnapshot } from "../../teacher/topic/task-progress";
import {
    DOGFOOD_COUNTS,
    DOGFOOD_NAMES,
    GUIDE_ATTACHMENT_PATH,
    MEAN_POPULATION_PATH,
    PPS_POPULATION_PATH,
} from "./dogfood-fixtures";

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
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
        .where(and(eq(topic.name, DOGFOOD_NAMES.topicA), isNull(topic.deletedAt), isNull(task.deletedAt)));
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
        .where(and(eq(student.classId, aTask.classId), isNull(student.deletedAt)))
        .orderBy(asc(student.studentId));
    const progress = buildTaskProgressSnapshot(progressRows);
    const expectedProgress = { not_started: 3, stage1: 1, stage2: 1, stage3: 1, stage4: 1, submitted: 1, graded: 1, rejected: 1 };
    check(JSON.stringify(progress.counts) === JSON.stringify(expectedProgress), `A progress buckets differ: ${JSON.stringify(progress.counts)}`);

    const authoritative = await db
        .select({
            studentId: student.studentId,
            topicName: topic.name,
            currentStage: experiment.currentStage,
            status: experiment.status,
            results: experiment.samplingResults,
            reportContent: experiment.reportContent,
            snapshot: experiment.submissionSnapshot,
        })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(eq(experiment.currentStage, 4));
    check(authoritative.length === 8, `Expected 8 stage4/terminal authoritative fixtures, got ${authoritative.length}`);

    function checkAuthoritativeMethods(label: string, value: unknown, allowUnavailablePps: boolean) {
        const results = value as Record<string, Record<string, unknown> | undefined> | null;
        for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
            check(results?.[method]?.serverGenerated === true, `${label}/${method} is not server generated`);
        }
        for (const method of ["simple", "systematic", "stratified"] as const) {
            const section = results?.[method];
            check(!Array.isArray(section?.data), `${label}/${method} unexpectedly embeds sampled rows`);
            check(Array.isArray(section?.indices) && section.indices.length === section.sampleCount, `${label}/${method} has invalid replay indices`);
        }
        const pps = results?.pps;
        if (allowUnavailablePps) {
            check(pps?.unavailable === true && !Array.isArray(pps.data) && !Array.isArray(pps.indices), `${label}/pps must be the compact unavailable marker`);
        } else {
            check(pps?.completed === true && pps.unavailable !== true, `${label}/pps is not a completed result`);
            check(!Array.isArray(pps.data), `${label}/pps unexpectedly embeds sampled rows`);
            check(Array.isArray(pps.indices) && pps.indices.length === pps.sampleCount, `${label}/pps has invalid replay indices`);
            check(Array.isArray(pps.inclusionProbabilities) && pps.inclusionProbabilities.length === pps.sampleCount, `${label}/pps probabilities differ from its sample count`);
        }
        return results;
    }

    for (const row of authoritative) {
        const label = `${row.studentId}/${row.topicName}`;
        const isMeanFixture = row.studentId === "S015" && row.topicName === DOGFOOD_NAMES.topicB;
        const liveResults = checkAuthoritativeMethods(label, row.results, isMeanFixture);
        if (row.status !== "in_progress") {
            const storedSnapshot = row.snapshot as Record<string, unknown> | null;
            check(storedSnapshot, `${label} has no submission snapshot`);
            const snapshotResults = checkAuthoritativeMethods(`${label}/snapshot`, storedSnapshot.samplingResults, isMeanFixture);
            check(JSON.stringify(snapshotResults) === JSON.stringify(liveResults), `${label} snapshot sampling results differ from the live record`);
            check(storedSnapshot.reportContent === row.reportContent, `${label} snapshot report differs from the live record`);
            check(validateReportForSubmit(row.reportContent) === null, `${label} live report is invalid`);
            check(validateReportForSubmit(storedSnapshot.reportContent) === null, `${label} snapshot report is invalid`);
        }
        if (isMeanFixture) {
            check(row.reportContent?.includes("PPS") && row.reportContent.includes("跳过"), "Mean live report does not explain skipped PPS");
            const snapshotReport = (row.snapshot as Record<string, unknown> | null)?.reportContent;
            check(typeof snapshotReport === "string" && snapshotReport.includes("PPS") && snapshotReport.includes("跳过"), "Mean snapshot report does not explain skipped PPS");
        }
    }
    check(authoritative.filter((row) => row.studentId === "S015" && row.topicName === DOGFOOD_NAMES.topicB).length === 1, "Expected exactly one mean PPS-unavailable fixture");

    const auditRows = await db
        .select({ method: samplingAttempt.method, seed: samplingAttempt.seed, sampleCount: samplingAttempt.sampleCount })
        .from(samplingAttempt)
        .innerJoin(experiment, eq(samplingAttempt.experimentId, experiment.id))
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(eq(student.studentId, "S015"), eq(topic.name, DOGFOOD_NAMES.topicA)))
        .orderBy(asc(samplingAttempt.createdAt));
    check(JSON.stringify(auditRows) === JSON.stringify([
        { method: "simple", seed: 202601, sampleCount: 132 },
        { method: "systematic", seed: 202602, sampleCount: 132 },
        { method: "pps", seed: 202603, sampleCount: 132 },
        { method: "stratified", seed: 202604, sampleCount: 132 },
    ]), `Sampling attempt fixtures differ: ${JSON.stringify(auditRows)}`);

    const visible = await db
        .select({ studentId: student.studentId, topicName: topic.name })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(
            eq(class_.teacherId, (await db.select({ id: teacher.id }).from(teacher).where(eq(teacher.employeeId, "T001")))[0]!.id),
            isNull(student.deletedAt),
            isNull(task.deletedAt),
            isNull(topic.deletedAt),
            inArray(experiment.status, ["submitted", "graded", "rejected"]),
        ));
    const visibleKeys = visible.map((row) => `${row.studentId}|${row.topicName}`).sort();
    const expectedVisible = [
        `S015|${DOGFOOD_NAMES.topicA}`,
        `S015|${DOGFOOD_NAMES.topicB}`,
        `S016|${DOGFOOD_NAMES.topicA}`,
        `S017|${DOGFOOD_NAMES.topicA}`,
    ].sort();
    check(JSON.stringify(visibleKeys) === JSON.stringify(expectedVisible), `Visible grading fixtures differ: ${JSON.stringify(visibleKeys)}`);

    const deletionRows = await db
        .select({ topicName: topic.name, topicDeletedAt: topic.deletedAt, taskDeletedAt: task.deletedAt, historicalCount: count(experiment.id) })
        .from(topic)
        .innerJoin(task, eq(task.topicId, topic.id))
        .leftJoin(experiment, eq(experiment.taskId, task.id))
        .where(inArray(topic.name, [DOGFOOD_NAMES.topicF, DOGFOOD_NAMES.topicG]))
        .groupBy(topic.name, topic.deletedAt, task.deletedAt);
    const deletedTopic = deletionRows.find((row) => row.topicName === DOGFOOD_NAMES.topicF);
    const deletedTask = deletionRows.find((row) => row.topicName === DOGFOOD_NAMES.topicG);
    check(deletedTopic?.topicDeletedAt && !deletedTopic.taskDeletedAt && deletedTopic.historicalCount === 1, "Deleted-topic historical invariant is missing");
    check(!deletedTask?.topicDeletedAt && deletedTask?.taskDeletedAt && deletedTask.historicalCount === 1, "Deleted-task historical invariant is missing");

    const storedTopics = await db
        .select({ name: topic.name, path: topic.excelFilePath, rowCount: topic.excelRowCount, fieldMapping: topic.fieldMapping })
        .from(topic)
        .where(and(inArray(topic.name, [DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.topicB]), isNull(topic.deletedAt)));
    check(storedTopics.length === 2, `Expected stored population metadata for topics A and B, got ${storedTopics.length}`);

    const expectedTopicFiles = {
        [DOGFOOD_NAMES.topicA]: {
            path: PPS_POPULATION_PATH,
            rowCount: 200,
            columns: ["编号", "年级", "专业", "性别", "每周学习时长", "月生活费", "学习满意度"],
            ppsFields: ["每周学习时长", "月生活费", "学习满意度"],
        },
        [DOGFOOD_NAMES.topicB]: {
            path: MEAN_POPULATION_PATH,
            rowCount: 24,
            columns: ["编号", "学院", "年级", "每周阅读时长", "是否住宿"],
            ppsFields: [],
        },
    } as const;
    const parsedRowCounts: Record<string, number> = {};
    for (const storedTopic of storedTopics) {
        const expected = expectedTopicFiles[storedTopic.name as keyof typeof expectedTopicFiles];
        check(expected, `Unexpected topic population metadata: ${storedTopic.name}`);
        check(storedTopic.path === expected.path, `${storedTopic.name} stored path differs: ${storedTopic.path}`);
        check(storedTopic.rowCount === expected.rowCount, `${storedTopic.name} stored row count differs: ${storedTopic.rowCount}`);
        const mapping = parseTopicFieldMapping(storedTopic.fieldMapping);
        check(mapping, `${storedTopic.name} field mapping is invalid`);

        const file = Bun.file(resolveStoragePath(storedTopic.path));
        check(await file.exists(), `${storedTopic.name} population file is missing: ${storedTopic.path}`);
        check(file.size > 0, `${storedTopic.name} population file is empty: ${storedTopic.path}`);
        const parsed = await parseSpreadsheetFile(await file.arrayBuffer(), storedTopic.path);
        check(parsed.rowCount === storedTopic.rowCount, `${storedTopic.name} parsed row count differs: ${parsed.rowCount}`);
        check(JSON.stringify(parsed.columns) === JSON.stringify(expected.columns), `${storedTopic.name} columns differ: ${JSON.stringify(parsed.columns)}`);
        const eligiblePpsFields = getPpsEligibleNumericFields(parsed.rows, mapping.numeric ?? []);
        check(JSON.stringify(eligiblePpsFields) === JSON.stringify(expected.ppsFields), `${storedTopic.name} PPS eligibility differs: ${JSON.stringify(eligiblePpsFields)}`);
        parsedRowCounts[storedTopic.name] = parsed.rowCount;
    }

    const attachments = await db
        .select({ path: topicAttachment.filePath, storedSize: topicAttachment.fileSize })
        .from(topicAttachment)
        .innerJoin(topic, eq(topicAttachment.topicId, topic.id))
        .where(and(eq(topic.name, DOGFOOD_NAMES.topicA), isNull(topic.deletedAt)));
    check(attachments.length === 1, `Expected one A attachment, got ${attachments.length}`);
    const storedAttachment = attachments[0]!;
    check(storedAttachment.path === GUIDE_ATTACHMENT_PATH, `A attachment stored path differs: ${storedAttachment.path}`);
    const attachmentFile = Bun.file(resolveStoragePath(storedAttachment.path));
    check(await attachmentFile.exists(), `A attachment is missing: ${storedAttachment.path}`);
    check(attachmentFile.size > 0 && attachmentFile.size === storedAttachment.storedSize, `A attachment size differs: db=${storedAttachment.storedSize} file=${attachmentFile.size}`);

    console.log("Dogfood seed check passed.");
    console.log(`Counts: ${Object.entries(actualCounts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log(`A progress: ${Object.entries(progress.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log(`Visible grading fixtures: ${visibleKeys.join(", ")}`);
    console.log(`Authoritative compact stage4/terminal fixtures: ${authoritative.length}; sampling attempts: ${auditRows.length}; population rows: A=${parsedRowCounts[DOGFOOD_NAMES.topicA]} B=${parsedRowCounts[DOGFOOD_NAMES.topicB]}`);
}

try {
    await verify();
} catch (error) {
    console.error("Dogfood seed check failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
