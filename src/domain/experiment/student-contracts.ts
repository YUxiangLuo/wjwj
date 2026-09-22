import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingPolicyV1 } from "../../lib/sampling-policy";
import type { ExperimentStatus, TaskStatus, SamplePlanData, SamplingResultsData } from "./types";
import type { SavedAnalysisView, VariableDictionary } from "../variables/types";
import type { TargetAnalysisMetrics } from "./analysis-types";

export interface CurrentStudent {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
}

export interface StudentTask {
    id: number;
    topicId: number;
    name: string;
    description: string | null;
    publishedAt: string;
    deadline: string | null;
    status: TaskStatus;
    progress: number;
    currentStage: number;
    score?: number;
    rejectReason?: string;
}

export interface TopicAttachment { id: number; name: string; type: string; size: number }

export interface TaskDetail extends Omit<StudentTask, "progress"> {
    populationSize: number;
    attachments: TopicAttachment[];
    recommendQuestions: Question[];
    samplingPolicy?: SamplingPolicyV1;
}


export interface Announcement {
    id: number;
    title: string;
    content: string;
    createdAt: string;
}

export interface SubmissionDetail {
    id: number;
    taskId: number;
    version: number;
    topicId: number;
    topicName: string;
    submittedAt: string | null;
    status: Exclude<ExperimentStatus, "in_progress">;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason: string | null;
    gradedAt: string | null;
    graderName: string | null;
    weights: { questionnaire: number; process: number; report: number };
    snapshot: {
        topicName: string;
        studentName: string;
        populationSize: number | null;
        questionnaire: QuestionnaireData | null;
        samplePlan: SamplePlanData | null;
        samplingResults: SamplingResultsData | null;
        samplingPolicy: SamplingPolicyV1;
        reportContent: string;
        analysisReferences?: number[];
        analysisAppendices?: SavedAnalysisView[];
        targetMetrics?: TargetAnalysisMetrics | null;
        variableDictionary?: VariableDictionary | null;
        samplingGeneration?: number;
    };
}
