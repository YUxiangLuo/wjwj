import { relations, sql } from "drizzle-orm";
import {
    bigint,
    check,
    customType,
    index,
    integer,
    jsonb,
    numeric,
    pgTable,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string; driverData: string }>({
    dataType() {
        return "citext";
    },
});

export type ExperimentStatus = "in_progress" | "submitted" | "graded" | "rejected";

// User domain
export const admin = pgTable(
    "admin",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        username: citext("username").notNull().unique(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
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
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
        status: smallint("status").notNull().default(1),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        statusIdx: index("teacher_idx_status").on(table.status),
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
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
        classId: bigint("class_id", { mode: "number" }).notNull().references(() => class_.id),
        status: smallint("status").notNull().default(1),
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        classIdIdx: index("student_idx_class_id").on(table.classId),
        statusIdx: index("student_idx_status").on(table.status),
        deletedIdx: index("student_idx_deleted").on(table.deletedAt),
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
        fieldMapping: jsonb("field_mapping"),
        weightConfig: jsonb("weight_config"),
        recommendQuestions: jsonb("recommend_questions"),
        status: smallint("status").notNull().default(0),
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        teacherIdIdx: index("topic_idx_teacher_id").on(table.teacherId),
        statusIdx: index("topic_idx_status").on(table.status),
        deletedIdx: index("topic_idx_deleted").on(table.deletedAt),
    }),
);

export const topicAttachment = pgTable(
    "topic_attachment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull().references(() => topic.id, { onDelete: "cascade" }),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        filePath: varchar("file_path", { length: 500 }).notNull(),
        fileType: varchar("file_type", { length: 50 }).notNull(),
        fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        topicIdIdx: index("topic_attachment_idx_topic_id").on(table.topicId),
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
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        uniqueTopicClass: uniqueIndex("task_uk_topic_class").on(table.topicId, table.classId),
        classIdIdx: index("task_idx_class_id").on(table.classId),
        deletedIdx: index("task_idx_deleted").on(table.deletedAt),
    }),
);

export const experiment = pgTable(
    "experiment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull().references(() => student.id, { onDelete: "cascade" }),
        taskId: bigint("task_id", { mode: "number" }).notNull().references(() => task.id, { onDelete: "cascade" }),
        version: integer("version").notNull().default(1),
        currentStage: smallint("current_stage").notNull().default(1),
        status: varchar("status", { length: 20 }).$type<ExperimentStatus>().notNull().default("in_progress"),
        questionnaire: jsonb("questionnaire"),
        samplePlan: jsonb("sample_plan"),
        samplingResults: jsonb("sampling_results"),
        reportContent: text("report_content"),
        stage1CompletedAt: timestamp("stage1_completed_at", { mode: "date", withTimezone: true }),
        stage2CompletedAt: timestamp("stage2_completed_at", { mode: "date", withTimezone: true }),
        stage3CompletedAt: timestamp("stage3_completed_at", { mode: "date", withTimezone: true }),
        stage4CompletedAt: timestamp("stage4_completed_at", { mode: "date", withTimezone: true }),
        submissionSnapshot: jsonb("submission_snapshot"),
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
