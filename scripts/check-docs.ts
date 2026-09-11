import { calculateMeanEstimationSampleSize } from "../src/student/experiment/sample-plan";
import { computePpsMeanPlan, DOGFOOD_COUNTS, DOGFOOD_MAIN_TASK_PROGRESS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";

/**
 * 文档一致性检查：README.md / DATABASE.md 中的 fixture 描述必须与默认 seed 同源。
 * 任何一处 seed 变动导致文档漂移都会让该检查失败（曾发生「比例-PPS全流程」与实际课题名漂移）。
 */

const readme = await Bun.file("README.md").text();
const database = await Bun.file("DATABASE.md").text();

const mainTaskRecommendedSize = computePpsMeanPlan().recommendedSize;
const meanTaskSize = calculateMeanEstimationSampleSize({
    confidenceLevel: "95",
    marginOfError: 2,
    populationSize: 24,
    populationVariance: 36,
    designEffect: 1,
    nonResponseRate: 0,
});
if (meanTaskSize === null) throw new Error(`无法计算「${DOGFOOD_NAMES.topicB}」任务的 fixture 样本量`);

const requiredReadmeFragments = [
    `${DOGFOOD_COUNTS.admin} 管理员、${DOGFOOD_COUNTS.teacher} 教师、${DOGFOOD_COUNTS.semester} 学期、${DOGFOOD_COUNTS.class} 班级、${DOGFOOD_COUNTS.student} 学生、${DOGFOOD_COUNTS.topic} 实验模板、${DOGFOOD_COUNTS.task} 实验任务、${DOGFOOD_COUNTS.experiment} 学生实验`,
    `主任务「${DOGFOOD_NAMES.topicA}」在班级成员中精确覆盖 8 个进度桶：未开始 ${DOGFOOD_MAIN_TASK_PROGRESS.not_started} 人`,
    `主任务「${DOGFOOD_NAMES.topicA}」`,
    `主任务推荐样本量为 ${mainTaskRecommendedSize}`,
    `「${DOGFOOD_NAMES.topicB}」任务样本量由生产计算函数得到 ${meanTaskSize}`,
    `160 名毕业生的直接就业比例/PPS`,
    `96 个食堂服务时段的平均等待时间/PPS`,
];
const requiredDatabaseFragments = [
    `${DOGFOOD_COUNTS.topic} topics, ${DOGFOOD_COUNTS.task} tasks, ${DOGFOOD_COUNTS.experiment} experiments`,
    "The main mean/PPS task",
    "mean and proportion targets",
];

const missing = [
    ...requiredReadmeFragments.filter((fragment) => !readme.includes(fragment)).map((fragment) => `README.md: ${fragment}`),
    ...requiredDatabaseFragments.filter((fragment) => !database.includes(fragment)).map((fragment) => `DATABASE.md: ${fragment}`),
];
if (missing.length > 0) {
    throw new Error(`文档与默认 seed 不一致：\n${missing.map((item) => `- ${item}`).join("\n")}`);
}

/**
 * 语义口径门禁（dogfood 第三批 E-01）：fixture 计数无法拦住行为描述漂移。
 * 样本量规划的实际行为是「猜测可跳过、理解检查与快速自检必须通过」，
 * 因此 README 不得再出现「自检可跳过」这类与实现相反的说法。
 */
const semanticClaims = [
    { ok: !/T004|S019|停用教师|停用学生/.test(readme), violation: "README.md 不得再描述账号停用（功能已移除；停用账号需删除而非启用）" },
    { ok: !/自检可跳过/.test(readme), violation: 'README.md 不得声称「自检可跳过」：快速自检要求每题答对才能继续' },
    { ok: /猜测可跳过/.test(readme), violation: 'README.md 需说明「猜测可跳过」' },
    { ok: /快速自检须答对每题/.test(readme), violation: 'README.md 需说明快速自检须答对每题后才能继续' },
    { ok: /理解检查/.test(readme), violation: 'README.md 需说明各步「理解检查」会解锁下一步' },
];
const contradicted = semanticClaims.filter((claim) => !claim.ok).map((claim) => `- ${claim.violation}`);
if (contradicted.length > 0) {
    throw new Error(`README 行为描述与实现不一致：\n${contradicted.join("\n")}`);
}

console.log("Documentation fixture summary and planning-behaviour claims are in sync.");
