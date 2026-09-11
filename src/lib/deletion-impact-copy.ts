export interface CascadeImpact {
    experiments: number;
    submitted: number;
    graded: number;
}

/**
 * One wording for every hard-delete confirmation. Students and tasks cascade the
 * same rows, so the sentence that describes the damage must not drift apart.
 */
export function describeCascadeImpact(impact: CascadeImpact, subject: "student" | "task") {
    if (impact.experiments === 0) {
        return subject === "student"
            ? "该学生没有实验记录，删除后学号可以重新导入。"
            : "该任务还没有学生实验记录。";
    }
    const details = [
        subject === "student" ? `${impact.experiments} 条实验记录` : `${impact.experiments} 条学生实验`,
    ];
    if (impact.submitted > 0) details.push(`已提交 ${impact.submitted} 条`);
    if (impact.graded > 0) details.push(`已批改 ${impact.graded} 条`);
    const suffix = subject === "student" ? "及其成绩与抽样记录。" : "及对应成绩与抽样记录。";
    return `将同时永久删除 ${details.join("、")}${suffix}`;
}
