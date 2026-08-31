import { calculateFinitePopulationSampleSize } from "../src/student/experiment/sample-plan";
import { computePpsMeanPlan, DOGFOOD_COUNTS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";

const readme = await Bun.file("README.md").text();
const database = await Bun.file("DATABASE.md").text();
const proportionSize = calculateFinitePopulationSampleSize({
    confidenceLevel: "95",
    marginOfError: 5,
    populationSize: 200,
    designEffect: 1,
    nonResponseRate: 0,
});
if (proportionSize === null) throw new Error("无法计算默认比例 fixture 样本量");

const requiredReadmeFragments = [
    `${DOGFOOD_COUNTS.topic} 课题、${DOGFOOD_COUNTS.task} 任务、${DOGFOOD_COUNTS.experiment} 实验`,
    `主任务「${DOGFOOD_NAMES.topicA}」`,
    `推荐样本量为 ${computePpsMeanPlan().recommendedSize}`,
    `「${DOGFOOD_NAMES.topicH}」推荐样本量为 ${proportionSize}`,
    `「${DOGFOOD_NAMES.topicB}」推荐样本量为 15`,
];
const requiredDatabaseFragments = [
    `${DOGFOOD_COUNTS.topic} topics, ${DOGFOOD_COUNTS.task} tasks, ${DOGFOOD_COUNTS.experiment} experiments`,
    "main mean/PPS task",
    "companion proportion/PPS fixture",
];
const missing = [
    ...requiredReadmeFragments.filter((fragment) => !readme.includes(fragment)).map((fragment) => `README.md: ${fragment}`),
    ...requiredDatabaseFragments.filter((fragment) => !database.includes(fragment)).map((fragment) => `DATABASE.md: ${fragment}`),
];
if (missing.length) throw new Error(`文档与默认 seed 不一致：\n${missing.map((item) => `- ${item}`).join("\n")}`);
console.log("Documentation fixture summary is in sync.");
