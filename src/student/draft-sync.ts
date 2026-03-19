const DRAFT_KEY_TEMPLATES = {
    questionnaire: "student_questionnaire_draft_",
    samplePlan: "student_sample_plan_draft_",
    samplingParams: "student_sampling_params_",
    report: "student_report_draft_",
} as const;

type DraftStage = 1 | 2 | 3 | 4;

function getStorageKey(taskId: number | string, stage: DraftStage) {
    switch (stage) {
        case 1:
            return `${DRAFT_KEY_TEMPLATES.questionnaire}${taskId}`;
        case 2:
            return `${DRAFT_KEY_TEMPLATES.samplePlan}${taskId}`;
        case 3:
            return `${DRAFT_KEY_TEMPLATES.samplingParams}${taskId}`;
        case 4:
            return `${DRAFT_KEY_TEMPLATES.report}${taskId}`;
    }
}

function readStorage(key: string) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore localStorage write errors
    }
}

function removeStorage(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore localStorage write errors
    }
}

export function getReportDraftKey(taskId: number | string) {
    return getStorageKey(taskId, 4);
}

export function readReportDraft(taskId: number | string) {
    return readStorage(getReportDraftKey(taskId));
}

export function writeReportDraft(taskId: number | string, value: string) {
    writeStorage(getReportDraftKey(taskId), value);
}

export function clearReportDraft(taskId: number | string) {
    removeStorage(getReportDraftKey(taskId));
}

export function clearExperimentDrafts(
    taskId: number | string,
    options?: { fromStage?: DraftStage; includeReport?: boolean }
) {
    const fromStage = options?.fromStage ?? 1;
    const includeReport = options?.includeReport ?? true;

    for (const stage of [1, 2, 3, 4] as const) {
        if (stage < fromStage) continue;
        if (stage === 4 && !includeReport) continue;
        removeStorage(getStorageKey(taskId, stage));
    }
}

export function clearLegacyExperimentDrafts(taskId: number | string) {
    clearExperimentDrafts(taskId, { fromStage: 1, includeReport: false });
}
