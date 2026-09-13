import { dirname, resolve } from "node:path";
import { computePpsMeanPlan, computeReadingPlan, DOGFOOD_COUNTS, DOGFOOD_MAIN_TASK_PROGRESS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";

/** 校验各专题的唯一事实来源，不要求 README 或数据库手册重复演示数据。 */
export function collectDocumentationIssues(demo: string, teaching: string) {
    const requiredDemoFragments = [
        `${DOGFOOD_COUNTS.admin} 管理员、${DOGFOOD_COUNTS.teacher} 教师、${DOGFOOD_COUNTS.semester} 学期、${DOGFOOD_COUNTS.class} 班级、${DOGFOOD_COUNTS.student} 学生、${DOGFOOD_COUNTS.topic} 实验模板、${DOGFOOD_COUNTS.task} 实验任务、${DOGFOOD_COUNTS.experiment} 学生实验`,
        `${DOGFOOD_COUNTS.samplingAttempt} 条抽样记录、${DOGFOOD_COUNTS.announcement} 公告、${DOGFOOD_COUNTS.topicAttachment} 附件`,
        `主任务「${DOGFOOD_NAMES.topicA}」在班级成员中精确覆盖 8 个进度桶：未开始 ${DOGFOOD_MAIN_TASK_PROGRESS.not_started} 人`,
        `主任务推荐样本量为 ${computePpsMeanPlan().recommendedSize}`,
        `「${DOGFOOD_NAMES.topicB}」任务样本量由生产计算函数得到 ${computeReadingPlan().recommendedSize}`,
        `「${DOGFOOD_NAMES.mainClass}」`,
        "160 名毕业生的直接就业比例/PPS",
        "96 个食堂服务时段的平均等待时间/PPS",
    ];
    const issues = requiredDemoFragments
        // 数字必须完整匹配，不能把样本量 999 当成正确的 9。
        .filter((fragment) => !new RegExp(`${RegExp.escape(fragment)}(?!\\d)`).test(demo))
        .map((fragment) => `docs/DEMO.md 缺少当前 seed 描述：${fragment}`);
    if (/T004|S019|停用教师|停用学生/.test(demo)) {
        issues.push("docs/DEMO.md 不得描述已移除的演示账号或账号停用状态");
    }
    for (const fragment of ["无需答题", "计算依据与原理", "草稿只记录当前页面和参数", "不再放行已完成阶段中的旧重复项", "存储读取采用同一严格解码规则"]) {
        if (!teaching.includes(fragment)) issues.push(`docs/TEACHING.md 缺少流程规则：${fragment}`);
    }
    if (/快速自检须答对|理解检查[」”]?解锁下一步/.test(teaching)) issues.push("docs/TEACHING.md 不得保留样本量规划答题解锁规则");
    return issues;
}

if (import.meta.main) {
    const issues = collectDocumentationIssues(
        await Bun.file("docs/DEMO.md").text(),
        await Bun.file("docs/TEACHING.md").text(),
    );
    // 删除或移动文档后，现行文档不能留下悬空的本地文件链接。
    for (const pattern of ["*.md", "docs/**/*.md"]) {
        for await (const path of new Bun.Glob(pattern).scan()) {
            const text = await Bun.file(path).text();
            for (const match of text.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
                const target = match[1]!;
                if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
                const filePath = decodeURIComponent(target.split(/[?#]/, 1)[0]!);
                if (!(await Bun.file(resolve(dirname(path), filePath)).exists())) {
                    issues.push(`${path} 链接不存在：${target}`);
                }
            }
        }
    }
    if (issues.length) throw new Error(`文档检查失败：\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    console.log("Documentation fixture, teaching rules, and local file links are in sync.");
}
