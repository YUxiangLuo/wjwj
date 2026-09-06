import { sql } from "drizzle-orm";
import { experiment, student, topic } from "../../db/schema";

/** Project only the immutable names; do not transfer the whole submitted work. */
export const gradeExportNames = {
    studentName: sql<string>`coalesce(${experiment.submissionSnapshot} ->> 'studentName', ${student.name})`,
    topicName: sql<string>`coalesce(${experiment.submissionSnapshot} ->> 'topicName', ${topic.name})`,
};
