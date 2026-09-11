// UI 验证前置：把某个学生推进到指定阶段（用与学生端相同的算法规划样本量）
import { Client } from "./lib";
import { calculateMeanEstimationSampleSize } from "../../src/student/experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../src/student/experiment/final-sample-bounds";

const [taskId, targetStage, studentId, populationField] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]!, process.argv[5] ?? "得分"];
const student = new Client("student");
await student.login("/api/student/login", { studentId, password: studentId });
let exp = (await student.get(`/api/student/tasks/${taskId}/experiment`)).body?.data;
const stage = exp?.currentStage ?? 1;

if (stage === 1 && targetStage >= 2) {
    const questionnaire = {
        title: "UI 验证问卷", welcomeText: "欢迎参加本次调查试填，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
        endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解总体特征。",
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, type: "single", content: `问题 ${index + 1}？`, options: ["A", "B", "C"] })),
    };
    const step = await student.post(`/api/student/tasks/${taskId}/experiment/stages/1/complete`, { observedVersion: exp.version, questionnaire });
    if (step.status !== 200) throw new Error(`阶段1失败 ${step.text.slice(0, 200)}`);
    exp = step.body.data;
}
if ((exp.currentStage ?? 1) === 2 && targetStage >= 3) {
    const stats = (await student.get(`/api/student/tasks/${taskId}/stats`)).body?.data;
    const variance = stats?.populationNumericStats?.[populationField]?.variance ?? null;
    // 总体规模只从实验响应里取：/stats 不返回 total（踩过一次，记进报告）
    const populationSize = exp.populationSize ?? stats?.total ?? 10;
    const recommended = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 5, populationSize, populationVariance: variance ?? 0, designEffect: 1, nonResponseRate: 0 });
    const bounds = getFinalSampleSizeBounds(populationSize);
    const finalSampleSize = Math.min(Math.max(recommended ?? bounds.min, bounds.min), bounds.max);
    const plan = await student.post(`/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
        observedVersion: exp.version,
        samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 5, populationVariance: variance, designEffect: 1, nonResponseRate: 0, recommendedSize: recommended, finalSampleSize },
    });
    if (plan.status !== 200) throw new Error(`阶段2失败 ${plan.text.slice(0, 200)}`);
    exp = plan.body.data;
}
console.log(JSON.stringify({ studentId, taskId, currentStage: exp?.currentStage, policy: exp?.samplingPolicy?.methods ?? null, samplePlan: exp?.samplePlan?.finalSampleSize ?? null }, null, 0));
