export function getSamplePlanDraftKey(taskId: number) {
    return `student_sample_plan_draft_${taskId}`;
}

export function getSamplingDraftKey(taskId: number) {
    return `student_sampling_params_${taskId}`;
}

export function getReportDraftKey(taskId: number) {
    return `student_report_draft_${taskId}`;
}

function removeDraft(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore storage cleanup errors
    }
}

export function clearExperimentDrafts(taskId: number, options?: {
    samplePlan?: boolean;
    sampling?: boolean;
    report?: boolean;
}) {
    const {
        samplePlan = true,
        sampling = true,
        report = true,
    } = options ?? {};

    if (samplePlan) removeDraft(getSamplePlanDraftKey(taskId));
    if (sampling) removeDraft(getSamplingDraftKey(taskId));
    if (report) removeDraft(getReportDraftKey(taskId));
}
