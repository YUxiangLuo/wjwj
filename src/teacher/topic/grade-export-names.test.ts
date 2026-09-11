import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { gradeExportNames } from "./grade-export-names";

// The export must project the immutable names captured at submission time and
// only fall back to the live row when the snapshot predates that field.

test("grade export names read the submission snapshot first", () => {
    const student = new PgDialect().sqlToQuery(gradeExportNames.studentName);
    const topic = new PgDialect().sqlToQuery(gradeExportNames.topicName);

    expect(student.sql).toContain("coalesce(");
    expect(student.sql).toContain("->> 'studentName'");
    expect(student.sql).toContain('"student"."name"');

    expect(topic.sql).toContain("coalesce(");
    expect(topic.sql).toContain("->> 'topicName'");
    expect(topic.sql).toContain('"topic"."name"');
});
