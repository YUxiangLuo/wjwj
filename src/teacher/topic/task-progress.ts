export interface TeacherTaskProgressStudentRow {
    studentId: string;
    name: string;
    experimentId: number | null;
    currentStage: number | null;
    experimentStatus: number | null;
    latestSubmission: string | null;
    lastActivity: Date | null;
}

export function buildTaskProgressSnapshot(students: TeacherTaskProgressStudentRow[]) {
    const counts = { not_started: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0, submitted: 0, graded: 0, rejected: 0 };

    const list = students.map((student) => {
        let status = "not_started";
        let stage: number | null = null;

        const [submissionId, submissionStatus] = student.latestSubmission
            ? student.latestSubmission.split(",").map(Number)
            : [null, null];

        if (!student.experimentId) {
            status = "not_started";
            counts.not_started++;
        } else if (submissionStatus === 2) {
            status = "graded";
            counts.graded++;
        } else if (submissionStatus === 3) {
            status = "rejected";
            counts.rejected++;
        } else if (student.experimentStatus === 1) {
            status = "submitted";
            counts.submitted++;
        } else {
            stage = student.currentStage ?? 0;
            if (stage <= 1) {
                status = "stage1";
                counts.stage1++;
            } else if (stage === 2) {
                status = "stage2";
                counts.stage2++;
            } else if (stage === 3) {
                status = "stage3";
                counts.stage3++;
            } else {
                status = "stage4";
                counts.stage4++;
            }
        }

        return {
            studentId: student.studentId,
            name: student.name,
            status,
            stage,
            lastActivity: student.lastActivity,
            submissionId: submissionId ?? null,
        };
    });

    return { counts, students: list };
}
