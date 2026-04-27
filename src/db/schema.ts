import {
    pgTable,
    bigint,
    bigserial,
    varchar,
    smallint,
    timestamp,
    jsonb,
    integer,
    index,
    numeric,
    text,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================
// 1. User Domain
// ============================================================

export const admin = pgTable(
    "admin",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        username: varchar("username", { length: 50 }).notNull().unique(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    }
);

export const teacher = pgTable(
    "teacher",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        employeeId: varchar("employee_id", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1), // 1-Normal, 0-Suspended
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        statusIdx: index("idx_teacher_status").on(t.status),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        account: varchar("account", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        creatorTeacherId: bigint("creator_teacher_id", { mode: "number" }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        statusIdx: index("idx_assistant_status").on(t.status),
        creatorTeacherIdIdx: index("idx_assistant_creator_teacher_id").on(t.creatorTeacherId),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        studentId: varchar("student_id", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        email: varchar("email", { length: 120 }),
        password: varchar("password", { length: 255 }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        isFirstLogin: smallint("is_first_login").notNull().default(1),
        status: smallint("status").notNull().default(1),
        loginFailCount: smallint("login_fail_count").notNull().default(0),
        lockedUntil: timestamp("locked_until", { mode: "date" }),
        deletedAt: timestamp("deleted_at", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        classIdIdx: index("idx_student_class_id").on(t.classId),
        statusIdx: index("idx_student_status").on(t.status),
        deletedIdx: index("idx_student_deleted").on(t.deletedAt),
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

export const semester = pgTable("semester", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 20 }).notNull().unique(),
    isCurrent: smallint("is_current").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
});

export const semesterRelations = relations(semester, ({ many }) => ({
    classes: many(class_),
}));

export const class_ = pgTable(
    "class",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        name: varchar("name", { length: 100 }).notNull(),
        semesterId: bigint("semester_id", { mode: "number" }).notNull(),
        teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        semesterIdIdx: index("idx_class_semester_id").on(t.semesterId),
        teacherIdIdx: index("idx_class_teacher_id").on(t.teacherId),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        assistantId: bigint("assistant_id", { mode: "number" }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueAssistantClass: uniqueIndex("uk_assistant_class").on(t.assistantId, t.classId),
        classIdIdx: index("idx_assistant_class_class_id").on(t.classId),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull(),
        fromClassId: bigint("from_class_id", { mode: "number" }).notNull(),
        toClassId: bigint("to_class_id", { mode: "number" }).notNull(),
        reason: varchar("reason", { length: 500 }),
        operatedBy: bigint("operated_by", { mode: "number" }).notNull(), // Admin ID
        transferredAt: timestamp("transferred_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        studentIdx: index("idx_student_transfer_student").on(t.studentId),
        fromClassIdx: index("idx_student_transfer_from_class").on(t.fromClassId),
        toClassIdx: index("idx_student_transfer_to_class").on(t.toClassId),
    })
);

// ============================================================
// 3. Teaching Domain
// ============================================================

export const topic = pgTable(
    "topic",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
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
        lockedAt: timestamp("locked_at", { mode: "date" }),
        deletedAt: timestamp("deleted_at", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        teacherIdIdx: index("idx_topic_teacher_id").on(t.teacherId),
        statusIdx: index("idx_topic_status").on(t.status),
        deletedIdx: index("idx_topic_deleted").on(t.deletedAt),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull(),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        filePath: varchar("file_path", { length: 500 }).notNull(),
        fileType: varchar("file_type", { length: 50 }).notNull(),
        fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        topicIdIdx: index("idx_topic_attachment_topic_id").on(t.topicId),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        topicId: bigint("topic_id", { mode: "number" }).notNull(),
        classId: bigint("class_id", { mode: "number" }).notNull(),
        openTime: timestamp("open_time", { mode: "date" }),
        deadline: timestamp("deadline", { mode: "date" }),
        deletedAt: timestamp("deleted_at", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        uniqueTopicClass: uniqueIndex("uk_topic_class").on(t.topicId, t.classId),
        classIdIdx: index("idx_task_class_id").on(t.classId),
        deletedIdx: index("idx_task_deleted").on(t.deletedAt),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        studentId: bigint("student_id", { mode: "number" }).notNull(),
        taskId: bigint("task_id", { mode: "number" }).notNull(),
        currentStage: smallint("current_stage").notNull().default(0), // 0-4
        status: smallint("status").notNull().default(0), // 0-Progress, 1-Submitted, ...
        questionnaire: jsonb("questionnaire"),
        samplePlan: jsonb("sample_plan"),
        samplingResults: jsonb("sampling_results"),
        samplingDataPath: varchar("sampling_data_path", { length: 500 }),
        reportContent: text("report_content"),
        stage1CompletedAt: timestamp("stage1_completed_at", { mode: "date" }),
        stage2CompletedAt: timestamp("stage2_completed_at", { mode: "date" }),
        stage3CompletedAt: timestamp("stage3_completed_at", { mode: "date" }),
        stage4CompletedAt: timestamp("stage4_completed_at", { mode: "date" }),
        lastSavedAt: timestamp("last_saved_at", { mode: "date" }),
        version: integer("version").notNull().default(1),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        uniqueStudentTask: uniqueIndex("uk_student_task").on(t.studentId, t.taskId),
        taskIdIdx: index("idx_experiment_task_id").on(t.taskId),
        statusIdx: index("idx_experiment_status").on(t.status),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
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
        pdfLastAttemptAt: timestamp("pdf_last_attempt_at", { mode: "date" }),
        pdfGeneratedAt: timestamp("pdf_generated_at", { mode: "date" }),
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
        lockedAt: timestamp("locked_at", { mode: "date" }),
        submittedAt: timestamp("submitted_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        gradedAt: timestamp("graded_at", { mode: "date" }),
    },
    (t) => ({
        experimentIdIdx: index("idx_submission_experiment_id").on(t.experimentId),
        experimentSubmittedIdIdx: index("idx_submission_experiment_submitted_id").on(t.experimentId, t.submittedAt, t.id),
        statusIdx: index("idx_submission_status").on(t.status),
        pdfStatusAttemptIdx: index("idx_submission_pdf_status_attempt").on(t.pdfStatus, t.pdfLastAttemptAt, t.id),
        lockedIdx: index("idx_submission_locked").on(t.lockedAt),
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
        id: bigserial("id", { mode: "number" }).primaryKey(),
        title: varchar("title", { length: 100 }).notNull(),
        content: text("content").notNull(),
        targetScope: varchar("target_scope", { length: 20 }).notNull().default("all"),
        status: smallint("status").notNull().default(1),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    },
    (t) => ({
        statusIdx: index("idx_announcement_status").on(t.status),
    })
);

export const announcementRead = pgTable(
    "announcement_read",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        announcementId: bigint("announcement_id", { mode: "number" }).notNull(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        readAt: timestamp("read_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueAnnouncementUser: uniqueIndex("uk_announcement_user").on(t.announcementId, t.userType, t.userId),
        userIdx: index("idx_announcement_read_user").on(t.userType, t.userId),
    })
);

export const loginLog = pgTable(
    "login_log",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        loginAt: timestamp("login_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        ipAddress: varchar("ip_address", { length: 45 }),
        userAgent: varchar("user_agent", { length: 500 }),
    },
    (t) => ({
        userIdx: index("idx_login_log_user").on(t.userType, t.userId),
        loginAtIdx: index("idx_login_log_login_at").on(t.loginAt),
    })
);

export const systemMetrics = pgTable(
    "system_metrics",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        metricType: varchar("metric_type", { length: 50 }).notNull(),
        metricValue: numeric("metric_value", { precision: 10, scale: 2 }).notNull(),
        recordedAt: timestamp("recorded_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        typeTimeIdx: index("idx_system_metrics_type_time").on(t.metricType, t.recordedAt),
    })
);

export const operationLog = pgTable(
    "operation_log",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        action: varchar("action", { length: 100 }).notNull(),
        targetType: varchar("target_type", { length: 50 }),
        targetId: bigint("target_id", { mode: "number" }),
        detail: jsonb("detail"),
        ipAddress: varchar("ip_address", { length: 45 }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        userIdx: index("idx_operation_log_user").on(t.userType, t.userId),
        actionIdx: index("idx_operation_log_action").on(t.action),
        createdAtIdx: index("idx_operation_log_created_at").on(t.createdAt),
    })
);

export const userSession = pgTable(
    "user_session",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
        userType: smallint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number" }).notNull(),
        deviceInfo: varchar("device_info", { length: 500 }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
        lastActiveAt: timestamp("last_active_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        userIdx: index("idx_user_session_user").on(t.userType, t.userId),
        expiresIdx: index("idx_user_session_expires").on(t.expiresAt),
    })
);

export const notification = pgTable(
    "notification",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        receiverType: smallint("receiver_type").notNull(),
        receiverId: bigint("receiver_id", { mode: "number" }).notNull(),
        type: varchar("type", { length: 50 }).notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        content: text("content").notNull(),
        relatedType: varchar("related_type", { length: 50 }),
        relatedId: bigint("related_id", { mode: "number" }),
        isRead: smallint("is_read").notNull().default(0),
        readAt: timestamp("read_at", { mode: "date" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        receiverIdx: index("idx_notification_receiver").on(t.receiverType, t.receiverId, t.isRead),
        typeIdx: index("idx_notification_type").on(t.type),
        createdAtIdx: index("idx_notification_created").on(t.createdAt),
    })
);

export const systemConfig = pgTable(
    "system_config",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        configKey: varchar("config_key", { length: 100 }).notNull().unique(),
        configValue: text("config_value").notNull(),
        valueType: varchar("value_type", { length: 20 }).notNull().default("string"),
        description: varchar("description", { length: 500 }),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
    }
);
