import {
    pgTable,
    bigint,
    varchar,
    smallint,
    timestamp,
    text,
    jsonb,
    numeric,
    integer,
    uniqueIndex,
    index,
    check,
    customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const citext = customType<{ data: string; driverData: string }>({
    dataType() {
        return "citext";
    },
});

// ============================================================
// 1. User Domain
// ============================================================

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
    (t) => ({
        usernameLength: check("admin_ck_username_length", sql`char_length(${t.username}) <= 50`),
    })
);

export const teacher = pgTable(
    "teacher",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        employeeId: citext("employee_id").notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1), // 1-Normal, 0-Suspended
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        statusIdx: index("teacher_idx_status").on(t.status),
        employeeIdLength: check("teacher_ck_employee_id_length", sql`char_length(${t.employeeId}) <= 50`),
    })
);

export const teacherRelations = relations(teacher, ({ many }) => ({
    topics: many(topic),
    classes: many(class_),
    assistants: many(assistant),
}));

export const assistant = pgTable(
    "assistant",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        account: citext("account").notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        creatorTeacherId: bigint("creator_teacher_id", { mode: "number" }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        statusIdx: index("assistant_idx_status").on(t.status),
        creatorTeacherIdIdx: index("assistant_idx_creator_teacher_id").on(t.creatorTeacherId),
        accountLength: check("assistant_ck_account_length", sql`char_length(${t.account}) <= 50`),
    })
);

export const assistantRelations = relations(assistant, ({ one, many }) => ({
    creatorTeacher: one(teacher, {
        fields: [assistant.creatorTeacherId],
        references: [teacher.id],
    }),
    assistantClasses: many(assistantClass),
}));

export const student = pgTable(
    "student",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: citext("student_id").notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        email: varchar("email", { length: 120 }),
        password: varchar("password", { length: 255 }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        classIdIdx: index("student_idx_class_id").on(t.classId),
        statusIdx: index("student_idx_status").on(t.status),
        deletedIdx: index("student_idx_deleted").on(t.deletedAt),
        studentIdLength: check("student_ck_student_id_length", sql`char_length(${t.studentId}) <= 50`),
    })
);

export const studentRelations = relations(student, ({ one, many }) => ({
    class: one(class_, {
        fields: [student.classId],
        references: [class_.id],
    }),
    experiments: many(experiment),
}));

// ============================================================
// 2. Organization Domain
// ============================================================

export const semester = pgTable(
    "semester",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        name: citext("name").notNull().unique(),
        isCurrent: smallint("is_current").notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        nameLength: check("semester_ck_name_length", sql`char_length(${t.name}) <= 20`),
    })
);

export const semesterRelations = relations(semester, ({ many }) => ({
    classes: many(class_),
}));

export const class_ = pgTable(
    "class",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        name: varchar("name", { length: 100 }).notNull(),
        semesterId: bigint("semester_id", { mode: "number" }).notNull(),
        teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        semesterIdIdx: index("class_idx_semester_id").on(t.semesterId),
        teacherIdIdx: index("class_idx_teacher_id").on(t.teacherId),
    })
);

export const classRelations = relations(class_, ({ one, many }) => ({
    semester: one(semester, {
        fields: [class_.semesterId],
        references: [semester.id],
    }),
    teacher: one(teacher, {
        fields: [class_.teacherId],
        references: [teacher.id],
    }),
    students: many(student),
    assistantClasses: many(assistantClass),
    tasks: many(task),
}));

export const assistantClass = pgTable(
    "assistant_class",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        assistantId: bigint("assistant_id", { mode: "number" }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        uniqueAssistantClass: uniqueIndex("assistant_class_uk_assistant_class").on(t.assistantId, t.classId),
        classIdIdx: index("assistant_class_idx_class_id").on(t.classId),
    })
);

export const assistantClassRelations = relations(assistantClass, ({ one }) => ({
    assistant: one(assistant, {
        fields: [assistantClass.assistantId],
        references: [assistant.id],
    }),
    class: one(class_, {
        fields: [assistantClass.classId],
        references: [class_.id],
    }),
}));

export const studentTransfer = pgTable(
    "student_transfer",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull(),
        fromClassId: bigint("from_class_id", { mode: "number" }).notNull(),
        toClassId: bigint("to_class_id", { mode: "number" }).notNull(),
        reason: varchar("reason", { length: 500 }),
        operatedBy: bigint("operated_by", { mode: "number" }).notNull(), // Admin ID
        transferredAt: timestamp("transferred_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        studentIdx: index("student_transfer_idx_student").on(t.studentId),
        fromClassIdx: index("student_transfer_idx_from_class").on(t.fromClassId),
        toClassIdx: index("student_transfer_idx_to_class").on(t.toClassId),
    })
);

// ============================================================
// 3. Teaching Domain
// ============================================================

export const topic = pgTable(
    "topic",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        excelFilePath: varchar("excel_file_path", { length: 500 }),
        excelRowCount: integer("excel_row_count").default(0),
        fieldMapping: jsonb("field_mapping"),
        weightConfig: jsonb("weight_config"),
        recommendQuestions: jsonb("recommend_questions"),
        status: smallint("status").notNull().default(0), // 0-Draft, 1-Published
        isDeleted: smallint("is_deleted").notNull().default(0), // Compatible V2
        lockedBy: bigint("locked_by", { mode: "number" }),
        lockedAt: timestamp("locked_at", { mode: "date", withTimezone: true }),
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        teacherIdIdx: index("topic_idx_teacher_id").on(t.teacherId),
        statusIdx: index("topic_idx_status").on(t.status),
        deletedIdx: index("topic_idx_deleted").on(t.deletedAt),
    })
);

export const topicRelations = relations(topic, ({ one, many }) => ({
    teacher: one(teacher, {
        fields: [topic.teacherId],
        references: [teacher.id],
    }),
    attachments: many(topicAttachment),
    tasks: many(task),
}));

export const topicAttachment = pgTable(
    "topic_attachment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull(),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        filePath: varchar("file_path", { length: 500 }).notNull(),
        fileType: varchar("file_type", { length: 50 }).notNull(),
        fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        topicIdIdx: index("topic_attachment_idx_topic_id").on(t.topicId),
    })
);

export const topicAttachmentRelations = relations(topicAttachment, ({ one }) => ({
    topic: one(topic, {
        fields: [topicAttachment.topicId],
        references: [topic.id],
    }),
}));

export const task = pgTable(
    "task",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        openTime: timestamp("open_time", { mode: "date", withTimezone: true }),
        deadline: timestamp("deadline", { mode: "date", withTimezone: true }),
        deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        uniqueTopicClass: uniqueIndex("task_uk_topic_class").on(t.topicId, t.classId),
        classIdIdx: index("task_idx_class_id").on(t.classId),
        deletedIdx: index("task_idx_deleted").on(t.deletedAt),
    })
);

export const taskRelations = relations(task, ({ one, many }) => ({
    topic: one(topic, {
        fields: [task.topicId],
        references: [topic.id],
    }),
    class: one(class_, {
        fields: [task.classId],
        references: [class_.id],
    }),
    experiments: many(experiment),
}));

// ============================================================
// 4. Experiment Domain
// ============================================================

export const experiment = pgTable(
    "experiment",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull(),
        taskId: bigint("task_id", { mode: "number" }).notNull(),
        currentStage: smallint("current_stage").notNull().default(0), // 0-4
        status: smallint("status").notNull().default(0), // 0-Progress, 1-Submitted, ...
        questionnaire: jsonb("questionnaire"),
        samplePlan: jsonb("sample_plan"),
        samplingResults: jsonb("sampling_results"),
        samplingDataPath: varchar("sampling_data_path", { length: 500 }),
        reportContent: text("report_content"),
        stage1CompletedAt: timestamp("stage1_completed_at", { mode: "date", withTimezone: true }),
        stage2CompletedAt: timestamp("stage2_completed_at", { mode: "date", withTimezone: true }),
        stage3CompletedAt: timestamp("stage3_completed_at", { mode: "date", withTimezone: true }),
        stage4CompletedAt: timestamp("stage4_completed_at", { mode: "date", withTimezone: true }),
        lastSavedAt: timestamp("last_saved_at", { mode: "date", withTimezone: true }),
        version: integer("version").notNull().default(1),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        uniqueStudentTask: uniqueIndex("experiment_uk_student_task").on(t.studentId, t.taskId),
        taskIdIdx: index("experiment_idx_task_id").on(t.taskId),
        statusIdx: index("experiment_idx_status").on(t.status),
    })
);

export const experimentRelations = relations(experiment, ({ one, many }) => ({
    student: one(student, {
        fields: [experiment.studentId],
        references: [student.id],
    }),
    task: one(task, {
        fields: [experiment.taskId],
        references: [task.id],
    }),
    submissions: many(submission),
}));

export const submission = pgTable(
    "submission",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        experimentId: bigint("experiment_id", { mode: "number" }).notNull(),
        questionnairePdfPath: varchar("questionnaire_pdf_path", { length: 500 }),
        reportPdfPath: varchar("report_pdf_path", { length: 500 }),
        pdfSnapshotQuestionnaire: jsonb("pdf_snapshot_questionnaire"),
        pdfSnapshotSamplingResults: jsonb("pdf_snapshot_sampling_results"),
        pdfSnapshotSamplePlan: jsonb("pdf_snapshot_sample_plan"),
        pdfSnapshotPopulationSize: integer("pdf_snapshot_population_size"),
        pdfSnapshotReportContent: text("pdf_snapshot_report_content"),
        pdfSnapshotTopicName: varchar("pdf_snapshot_topic_name", { length: 200 }),
        pdfSnapshotStudentName: varchar("pdf_snapshot_student_name", { length: 100 }),
        pdfStatus: smallint("pdf_status").notNull().default(0), // 0-Pending, 1-Generating, 2-Ready, 3-Failed
        pdfGenerationAttempts: integer("pdf_generation_attempts").notNull().default(0),
        pdfLastAttemptAt: timestamp("pdf_last_attempt_at", { mode: "date", withTimezone: true }),
        pdfGeneratedAt: timestamp("pdf_generated_at", { mode: "date", withTimezone: true }),
        pdfError: varchar("pdf_error", { length: 500 }),
        scoreQuestionnaire: numeric("score_questionnaire", { precision: 5, scale: 2 }),
        scoreProcess: numeric("score_process", { precision: 5, scale: 2 }),
        scoreReport: numeric("score_report", { precision: 5, scale: 2 }),
        totalScore: numeric("total_score", { precision: 5, scale: 2 }),
        teacherComment: text("teacher_comment"),
        rejectReason: text("reject_reason"),
        status: smallint("status").notNull().default(1), // 0-Draft, 1-Pending, ...
        gradedByType: smallint("graded_by_type"),
        gradedById: bigint("graded_by_id", { mode: "number" }),
        lockedByType: smallint("locked_by_type"),
        lockedById: bigint("locked_by_id", { mode: "number" }),
        lockedAt: timestamp("locked_at", { mode: "date", withTimezone: true }),
        submittedAt: timestamp("submitted_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        gradedAt: timestamp("graded_at", { mode: "date", withTimezone: true }),
    },
    (t) => ({
        experimentIdIdx: index("submission_idx_experiment_id").on(t.experimentId),
        experimentSubmittedIdIdx: index("submission_idx_experiment_submitted_id").on(t.experimentId, t.submittedAt, t.id),
        statusIdx: index("submission_idx_status").on(t.status),
        pdfStatusAttemptIdx: index("submission_idx_pdf_status_attempt").on(t.pdfStatus, t.pdfLastAttemptAt, t.id),
        lockedIdx: index("submission_idx_locked").on(t.lockedAt),
    })
);

export const submissionRelations = relations(submission, ({ one }) => ({
    experiment: one(experiment, {
        fields: [submission.experimentId],
        references: [experiment.id],
    }),
}));

// ============================================================
// 5. System Domain
// ============================================================

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
    (t) => ({
        statusIdx: index("announcement_idx_status").on(t.status),
    })
);

export const announcementRead = pgTable(
    "announcement_read",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        announcementId: bigint("announcement_id", { mode: "number" }).notNull(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        readAt: timestamp("read_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        uniqueAnnouncementUser: uniqueIndex("announcement_read_uk_announcement_user").on(t.announcementId, t.userType, t.userId),
        userIdx: index("announcement_read_idx_user").on(t.userType, t.userId),
    })
);

export const loginLog = pgTable(
    "login_log",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        loginAt: timestamp("login_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        ipAddress: varchar("ip_address", { length: 45 }),
        userAgent: varchar("user_agent", { length: 500 }),
    },
    (t) => ({
        userIdx: index("login_log_idx_user").on(t.userType, t.userId),
        loginAtIdx: index("login_log_idx_login_at").on(t.loginAt),
    })
);

export const systemMetrics = pgTable(
    "system_metrics",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        metricType: varchar("metric_type", { length: 50 }).notNull(),
        metricValue: numeric("metric_value", { precision: 10, scale: 2 }).notNull(),
        recordedAt: timestamp("recorded_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        typeTimeIdx: index("system_metrics_idx_type_time").on(t.metricType, t.recordedAt),
    })
);

export const operationLog = pgTable(
    "operation_log",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        action: varchar("action", { length: 100 }).notNull(),
        targetType: varchar("target_type", { length: 50 }),
        targetId: bigint("target_id", { mode: "number" }),
        detail: jsonb("detail"),
        ipAddress: varchar("ip_address", { length: 45 }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        userIdx: index("operation_log_idx_user").on(t.userType, t.userId),
        actionIdx: index("operation_log_idx_action").on(t.action),
        createdAtIdx: index("operation_log_idx_created_at").on(t.createdAt),
    })
);

export const userSession = pgTable(
    "user_session",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        deviceInfo: varchar("device_info", { length: 500 }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
        lastActiveAt: timestamp("last_active_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        userIdx: index("user_session_idx_user").on(t.userType, t.userId),
        expiresIdx: index("user_session_idx_expires").on(t.expiresAt),
    })
);

export const notification = pgTable(
    "notification",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        receiverType: smallint("receiver_type").notNull(),
        receiverId: bigint("receiver_id", { mode: "number" }).notNull(),
        type: varchar("type", { length: 50 }).notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        content: text("content").notNull(),
        relatedType: varchar("related_type", { length: 50 }),
        relatedId: bigint("related_id", { mode: "number" }),
        isRead: smallint("is_read").notNull().default(0),
        readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
        createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        receiverIdx: index("notification_idx_receiver").on(t.receiverType, t.receiverId, t.isRead),
        typeIdx: index("notification_idx_type").on(t.type),
        createdAtIdx: index("notification_idx_created").on(t.createdAt),
    })
);

export const systemConfig = pgTable(
    "system_config",
    {
        id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
        configKey: citext("config_key").notNull().unique(),
        configValue: text("config_value").notNull(),
        valueType: varchar("value_type", { length: 20 }).notNull().default("string"),
        description: varchar("description", { length: 500 }),
        updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        configKeyLength: check("system_config_ck_config_key_length", sql`char_length(${t.configKey}) <= 100`),
    })
);
