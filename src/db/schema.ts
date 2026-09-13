import { relations, sql } from "drizzle-orm";
import {
    bigint,
    check,
    customType,
    index,
    integer,
    numeric,
    pgTable,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";
import { nativeJsonb } from "./native-jsonb";

const citext = customType<{ data: string; driverData: string }>({
    dataType() {
        return "citext";
    },
});

export type ExperimentStatus = import("../domain/experiment/status").ExperimentStatusValue;

// User domain
export const admin = pgTable(
    "admin",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        username: citext("username").notNull().unique(),
        password: varchar("password", { length: 255 }).notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        usernameLength: check("admin_ck_username_length", sql`char_length(${table.username}) <= 50`),
    }),
);

export const teacher = pgTable(
    "teacher",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        employeeId: citext("employee_id").notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        employeeIdLength: check("teacher_ck_employee_id_length", sql`char_length(${table.employeeId}) <= 50`),
    }),
);

export const student = pgTable(
    "student",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: citext("student_id").notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        email: varchar("email", { length: 120 }),
        password: varchar("password", { length: 255 }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull().references(() => class_.id),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        classIdIdx: index("student_idx_class_id").on(table.classId),
        studentIdLength: check("student_ck_student_id_length", sql`char_length(${table.studentId}) <= 50`),
    }),
);

// Organization domain
export const semester = pgTable(
    "semester",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        name: citext("name").notNull().unique(),
        isCurrent: smallint("is_current").notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        nameLength: check("semester_ck_name_length", sql`char_length(${table.name}) <= 20`),
        currentCheck: check("semester_ck_is_current", sql`${table.isCurrent} in (0, 1)`),
        singleCurrent: uniqueIndex("semester_uk_single_current")
            .on(table.isCurrent)
            .where(sql`${table.isCurrent} = 1`),
    }),
);

export const class_ = pgTable(
    "class",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        name: varchar("name", { length: 100 }).notNull(),
        semesterId: bigint("semester_id", { mode: "number" }).notNull().references(() => semester.id),
        teacherId: bigint("teacher_id", { mode: "number" }).notNull().references(() => teacher.id),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        semesterIdIdx: index("class_idx_semester_id").on(table.semesterId),
        teacherIdIdx: index("class_idx_teacher_id").on(table.teacherId),
    }),
);

// Teaching domain
export const topic = pgTable(
    "topic",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        teacherId: bigint("teacher_id", { mode: "number" }).notNull().references(() => teacher.id),
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        excelFilePath: varchar("excel_file_path", { length: 500 }),
        excelRowCount: integer("excel_row_count").notNull().default(0),
        fieldMapping: nativeJsonb("field_mapping"),
        variableDictionary: nativeJsonb("variable_dictionary").$type<import("../domain/variables/types").VariableDictionary>(),
        variableRevision: integer("variable_revision").notNull().default(0),
        samplingPolicy: nativeJsonb("sampling_policy").notNull().default(sql`'{"version":1,"methods":{"simple":"required","systematic":"optional","pps":"optional","stratified":"optional"}}'::jsonb`),
        weightConfig: nativeJsonb("weight_config"),
        recommendQuestions: nativeJsonb("recommend_questions"),
        status: smallint("status").notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        teacherIdIdx: index("topic_idx_teacher_id").on(table.teacherId),
        statusIdx: index("topic_idx_status").on(table.status),
        fieldMappingObject: check(
            "topic_ck_field_mapping_object",
            sql`${table.fieldMapping} is null or jsonb_typeof(${table.fieldMapping}) = 'object'`,
        ),
        samplingPolicyObject: check(
            "topic_ck_sampling_policy_object",
            sql`jsonb_typeof(${table.samplingPolicy}) = 'object'`,
        ),
        weightConfigObject: check(
            "topic_ck_weight_config_object",
            sql`${table.weightConfig} is null or jsonb_typeof(${table.weightConfig}) = 'object'`,
        ),
        recommendQuestionsArray: check(
            "topic_ck_recommend_questions_array",
            sql`${table.recommendQuestions} is null or jsonb_typeof(${table.recommendQuestions}) = 'array'`,
        ),
        statusCheck: check("topic_ck_status_value", sql`${table.status} in (0, 1)`),
        rowCountCheck: check("topic_ck_excel_row_count", sql`${table.excelRowCount} between 0 and 100000`),
    }),
);

export const topicAttachment = pgTable(
    "topic_attachment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull().references(() => topic.id, { onDelete: "cascade" }),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        filePath: varchar("file_path", { length: 500 }).notNull(),
        fileType: varchar("file_type", { length: 120 }).notNull(),
        fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        topicIdIdx: index("topic_attachment_idx_topic_id").on(table.topicId),
        fileSizeCheck: check("topic_attachment_ck_file_size", sql`${table.fileSize} >= 0`),
    }),
);

export const task = pgTable(
    "task",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull().references(() => topic.id),
        classId: bigint("class_id", { mode: "number" }).notNull().references(() => class_.id),
        openTime: timestamp("open_time", { mode: "date", withTimezone: true }),
        deadline: timestamp("deadline", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        uniqueTopicClass: uniqueIndex("task_uk_topic_class").on(table.topicId, table.classId),
        classIdIdx: index("task_idx_class_id").on(table.classId),
    }),
);

export const experiment = pgTable(
    "experiment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull().references(() => student.id, { onDelete: "cascade" }),
        taskId: bigint("task_id", { mode: "number" }).notNull().references(() => task.id, { onDelete: "cascade" }),
        version: integer("version").notNull().default(1),
        samplingGeneration: integer("sampling_generation").notNull().default(0),
        analysisReferences: nativeJsonb("analysis_references").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
        currentStage: smallint("current_stage").notNull().default(1),
        status: varchar("status", { length: 20 }).$type<ExperimentStatus>().notNull().default("in_progress"),
        questionnaire: nativeJsonb("questionnaire"),
        samplePlan: nativeJsonb("sample_plan"),
        samplingResults: nativeJsonb("sampling_results"),
        reportContent: text("report_content"),
        stage1CompletedAt: timestamp("stage1_completed_at", { mode: "date", withTimezone: true }),
        stage2CompletedAt: timestamp("stage2_completed_at", { mode: "date", withTimezone: true }),
        stage3CompletedAt: timestamp("stage3_completed_at", { mode: "date", withTimezone: true }),
        stage4CompletedAt: timestamp("stage4_completed_at", { mode: "date", withTimezone: true }),
        submissionSnapshot: nativeJsonb("submission_snapshot"),
        submittedAt: timestamp("submitted_at", { mode: "date", withTimezone: true }),
        scoreQuestionnaire: numeric("score_questionnaire", { precision: 5, scale: 2 }),
        scoreProcess: numeric("score_process", { precision: 5, scale: 2 }),
        scoreReport: numeric("score_report", { precision: 5, scale: 2 }),
        totalScore: numeric("total_score", { precision: 5, scale: 2 }),
        teacherComment: text("teacher_comment"),
        rejectReason: text("reject_reason"),
        gradedByTeacherId: bigint("graded_by_teacher_id", { mode: "number" }).references(() => teacher.id, { onDelete: "set null" }),
        gradedAt: timestamp("graded_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        uniqueStudentTask: uniqueIndex("experiment_uk_student_task").on(table.studentId, table.taskId),
        taskIdIdx: index("experiment_idx_task_id").on(table.taskId),
        statusIdx: index("experiment_idx_status").on(table.status),
        graderIdx: index("experiment_idx_grader").on(table.gradedByTeacherId),
        statusCheck: check(
            "experiment_ck_status",
            sql`${table.status} in ('in_progress', 'submitted', 'graded', 'rejected')`,
        ),
        versionCheck: check("experiment_ck_version", sql`${table.version} >= 1`),
        currentStageCheck: check("experiment_ck_current_stage", sql`${table.currentStage} between 1 and 4`),
        scoreRangesCheck: check(
            "experiment_ck_score_ranges",
            sql`(${table.scoreQuestionnaire} is null or ${table.scoreQuestionnaire} between 0 and 100)
                and (${table.scoreProcess} is null or ${table.scoreProcess} between 0 and 100)
                and (${table.scoreReport} is null or ${table.scoreReport} between 0 and 100)
                and (${table.totalScore} is null or ${table.totalScore} between 0 and 100)`,
        ),
        questionnaireObject: check(
            "experiment_ck_questionnaire_object",
            sql`${table.questionnaire} is null or jsonb_typeof(${table.questionnaire}) = 'object'`,
        ),
        samplePlanObject: check(
            "experiment_ck_sample_plan_object",
            sql`${table.samplePlan} is null or jsonb_typeof(${table.samplePlan}) = 'object'`,
        ),
        samplingResultsObject: check(
            "experiment_ck_sampling_results_object",
            sql`${table.samplingResults} is null or jsonb_typeof(${table.samplingResults}) = 'object'`,
        ),
        submissionSnapshotObject: check(
            "experiment_ck_submission_snapshot_object",
            sql`${table.submissionSnapshot} is null or jsonb_typeof(${table.submissionSnapshot}) = 'object'`,
        ),
    }),
);

export const savedAnalysis = pgTable("saved_analysis", {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    experimentId: bigint("experiment_id", { mode: "number" }).notNull().references(() => experiment.id, { onDelete: "cascade" }),
    requestId: varchar("request_id", { length: 80 }).notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    samplingGeneration: integer("sampling_generation").notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    dictionaryRevision: integer("dictionary_revision").notNull(),
    config: nativeJsonb("config").$type<import("../domain/variables/types").AnalysisConfig>().notNull(),
    variable: nativeJsonb("variable").$type<import("../domain/variables/types").VariableDefinition>().notNull(),
    result: nativeJsonb("result").$type<import("../domain/variables/types").AnalysisResult>().notNull(),
    evidence: nativeJsonb("evidence").notNull(),
    algorithmVersion: varchar("algorithm_version", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    requestUnique: uniqueIndex("saved_analysis_uk_request").on(table.experimentId, table.requestId),
    experimentIdx: index("saved_analysis_idx_experiment").on(table.experimentId),
    generationCheck: check("saved_analysis_ck_generation", sql`${table.samplingGeneration} >= 0`),
}));

export const samplingAttempt = pgTable(
    "sampling_attempt",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        experimentId: bigint("experiment_id", { mode: "number" }).notNull().references(() => experiment.id, { onDelete: "cascade" }),
        method: varchar("method", { length: 20 }).notNull(),
        seed: bigint("seed", { mode: "number" }).notNull(),
        sampleCount: integer("sample_count").notNull(),
        details: nativeJsonb("details").notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        experimentIdx: index("sampling_attempt_idx_experiment").on(table.experimentId, table.createdAt),
        methodCheck: check("sampling_attempt_ck_method", sql`${table.method} in ('simple', 'systematic', 'pps', 'stratified')`),
        sampleCountCheck: check("sampling_attempt_ck_sample_count", sql`${table.sampleCount} >= 0`),
        detailsObject: check("sampling_attempt_ck_details_object", sql`jsonb_typeof(${table.details}) = 'object'`),
    }),
);

// Small system domain
export const announcement = pgTable(
    "announcement",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        title: varchar("title", { length: 100 }).notNull(),
        content: text("content").notNull(),
        targetScope: varchar("target_scope", { length: 20 }).notNull().default("all"),
        status: smallint("status").notNull().default(1),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        statusIdx: index("announcement_idx_status").on(table.status),
        scopeCheck: check("announcement_ck_target_scope", sql`${table.targetScope} in ('all', 'teacher', 'student')`),
        statusCheck: check("announcement_ck_status_value", sql`${table.status} in (0, 1)`),
    }),
);

export const auditEvent = pgTable(
    "audit_event",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        actorType: varchar("actor_type", { length: 20 }).notNull(),
        actorId: bigint("actor_id", { mode: "number" }).notNull(),
        action: varchar("action", { length: 80 }).notNull(),
        entityType: varchar("entity_type", { length: 40 }).notNull(),
        entityId: bigint("entity_id", { mode: "number" }).notNull(),
        details: nativeJsonb("details").notNull().default(sql`'{}'::jsonb`),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        entityIdx: index("audit_event_idx_entity").on(table.entityType, table.entityId, table.createdAt),
        actorIdx: index("audit_event_idx_actor").on(table.actorType, table.actorId, table.createdAt),
        actorTypeCheck: check("audit_event_ck_actor_type", sql`${table.actorType} in ('admin', 'teacher', 'student', 'system')`),
        detailsObject: check("audit_event_ck_details_object", sql`jsonb_typeof(${table.details}) = 'object'`),
    }),
);

export const userSession = pgTable(
    "user_session",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    },
    (table) => ({
        userIdx: index("user_session_idx_user").on(table.userType, table.userId),
        expiresIdx: index("user_session_idx_expires").on(table.expiresAt),
        userTypeCheck: check("user_session_ck_user_type", sql`${table.userType} in (1, 2, 3)`),
    }),
);

// Relations are kept only where query builders use them.
export const teacherRelations = relations(teacher, ({ many }) => ({
    topics: many(topic),
    classes: many(class_),
}));

export const studentRelations = relations(student, ({ one, many }) => ({
    class: one(class_, { fields: [student.classId], references: [class_.id] }),
    experiments: many(experiment),
}));

export const semesterRelations = relations(semester, ({ many }) => ({ classes: many(class_) }));

export const classRelations = relations(class_, ({ one, many }) => ({
    semester: one(semester, { fields: [class_.semesterId], references: [semester.id] }),
    teacher: one(teacher, { fields: [class_.teacherId], references: [teacher.id] }),
    students: many(student),
    tasks: many(task),
}));

export const topicRelations = relations(topic, ({ one, many }) => ({
    teacher: one(teacher, { fields: [topic.teacherId], references: [teacher.id] }),
    attachments: many(topicAttachment),
    tasks: many(task),
}));

export const topicAttachmentRelations = relations(topicAttachment, ({ one }) => ({
    topic: one(topic, { fields: [topicAttachment.topicId], references: [topic.id] }),
}));

export const taskRelations = relations(task, ({ one, many }) => ({
    topic: one(topic, { fields: [task.topicId], references: [topic.id] }),
    class: one(class_, { fields: [task.classId], references: [class_.id] }),
    experiments: many(experiment),
}));

export const experimentRelations = relations(experiment, ({ one }) => ({
    student: one(student, { fields: [experiment.studentId], references: [student.id] }),
    task: one(task, { fields: [experiment.taskId], references: [task.id] }),
    gradedBy: one(teacher, { fields: [experiment.gradedByTeacherId], references: [teacher.id] }),
}));
