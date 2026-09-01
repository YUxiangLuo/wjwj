import { calculateMeanEstimationSampleSize } from "../src/student/experiment/sample-plan";
import { computePpsMeanPlan, DOGFOOD_COUNTS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";

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
if (meanTaskSize === null) throw new Error("无法计算「均值-无PPS」任务的 fixture 样本量");

const requiredReadmeFragments = [
    `${DOGFOOD_COUNTS.topic} 课题、${DOGFOOD_COUNTS.task} 任务、${DOGFOOD_COUNTS.experiment} 实验`,
    `主任务「${DOGFOOD_NAMES.topicA}」`,
    `主任务推荐样本量为 ${mainTaskRecommendedSize}`,
    `「${DOGFOOD_NAMES.topicB}」任务样本量由生产计算函数得到 ${meanTaskSize}`,
];
const requiredDatabaseFragments = [
    `${DOGFOOD_COUNTS.topic} topics, ${DOGFOOD_COUNTS.task} tasks, ${DOGFOOD_COUNTS.experiment} experiments`,
    "The main mean/PPS task",
];

const missing = [
    ...requiredReadmeFragments.filter((fragment) => !readme.includes(fragment)).map((fragment) => `README.md: ${fragment}`),
    ...requiredDatabaseFragments.filter((fragment) => !database.includes(fragment)).map((fragment) => `DATABASE.md: ${fragment}`),
];
if (missing.length > 0) {
    throw new Error(`文档与默认 seed 不一致：\n${missing.map((item) => `- ${item}`).join("\n")}`);
}
console.log("Documentation fixture summary is in sync.");
