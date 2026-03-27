import {
    mysqlTable,
    bigint,
    varchar,
    tinyint,
    datetime,
    text,
    json,
    decimal,
    int,
    uniqueIndex,
    index,
    boolean,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

// ============================================================
// 1. User Domain
// ============================================================

export const admin = mysqlTable(
    "admin",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        username: varchar("username", { length: 50 }).notNull().unique(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: tinyint("is_first_login").notNull().default(1),
        loginFailCount: tinyint("login_fail_count", { unsigned: true }).notNull().default(0),
        lockedUntil: datetime("locked_until", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    }
);

export const teacher = mysqlTable(
    "teacher",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        employeeId: varchar("employee_id", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        isFirstLogin: tinyint("is_first_login").notNull().default(1),
        status: tinyint("status").notNull().default(1), // 1-Normal, 0-Suspended
        loginFailCount: tinyint("login_fail_count", { unsigned: true }).notNull().default(0),
        lockedUntil: datetime("locked_until", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        statusIdx: index("idx_status").on(t.status),
    })
);

export const teacherRelations = relations(teacher, ({ many }) => ({
    topics: many(topic),
    classes: many(class_),
    assistants: many(assistant),
}));

export const assistant = mysqlTable(
    "assistant",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        account: varchar("account", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        creatorTeacherId: bigint("creator_teacher_id", { mode: "number", unsigned: true }).notNull(),
        isFirstLogin: tinyint("is_first_login").notNull().default(1),
        status: tinyint("status").notNull().default(1),
        loginFailCount: tinyint("login_fail_count", { unsigned: true }).notNull().default(0),
        lockedUntil: datetime("locked_until", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        statusIdx: index("idx_status").on(t.status),
        creatorTeacherIdIdx: index("idx_creator_teacher_id").on(t.creatorTeacherId),
    })
);

export const assistantRelations = relations(assistant, ({ one, many }) => ({
    creatorTeacher: one(teacher, {
        fields: [assistant.creatorTeacherId],
        references: [teacher.id],
    }),
    assistantClasses: many(assistantClass),
}));

export const student = mysqlTable(
    "student",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        studentId: varchar("student_id", { length: 50 }).notNull().unique(),
        name: varchar("name", { length: 100 }).notNull(),
        email: varchar("email", { length: 120 }),
        password: varchar("password", { length: 255 }).notNull(),
        classId: bigint("class_id", { mode: "number", unsigned: true }).notNull(),
        isFirstLogin: tinyint("is_first_login").notNull().default(1),
        status: tinyint("status").notNull().default(1),
        loginFailCount: tinyint("login_fail_count", { unsigned: true }).notNull().default(0),
        lockedUntil: datetime("locked_until", { mode: "date" }),
        deletedAt: datetime("deleted_at", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        classIdIdx: index("idx_class_id").on(t.classId),
        statusIdx: index("idx_status").on(t.status),
        deletedIdx: index("idx_deleted").on(t.deletedAt),
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

export const semester = mysqlTable("semester", {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    name: varchar("name", { length: 20 }).notNull().unique(),
    isCurrent: tinyint("is_current").notNull().default(0),
    createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const semesterRelations = relations(semester, ({ many }) => ({
    classes: many(class_),
}));

export const class_ = mysqlTable(
    "class",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        name: varchar("name", { length: 100 }).notNull(),
        semesterId: bigint("semester_id", { mode: "number", unsigned: true }).notNull(),
        teacherId: bigint("teacher_id", { mode: "number", unsigned: true }).notNull(),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        semesterIdIdx: index("idx_semester_id").on(t.semesterId),
        teacherIdIdx: index("idx_teacher_id").on(t.teacherId),
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

export const assistantClass = mysqlTable(
    "assistant_class",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        assistantId: bigint("assistant_id", { mode: "number", unsigned: true }).notNull(),
        classId: bigint("class_id", { mode: "number", unsigned: true }).notNull(),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueAssistantClass: uniqueIndex("uk_assistant_class").on(t.assistantId, t.classId),
        classIdIdx: index("idx_class_id").on(t.classId),
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

export const studentTransfer = mysqlTable(
    "student_transfer",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
        fromClassId: bigint("from_class_id", { mode: "number", unsigned: true }).notNull(),
        toClassId: bigint("to_class_id", { mode: "number", unsigned: true }).notNull(),
        reason: varchar("reason", { length: 500 }),
        operatedBy: bigint("operated_by", { mode: "number", unsigned: true }).notNull(), // Admin ID
        transferredAt: datetime("transferred_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        studentIdx: index("idx_student").on(t.studentId),
        fromClassIdx: index("idx_from_class").on(t.fromClassId),
        toClassIdx: index("idx_to_class").on(t.toClassId),
    })
);

// ============================================================
// 3. Teaching Domain
// ============================================================

export const topic = mysqlTable(
    "topic",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        teacherId: bigint("teacher_id", { mode: "number", unsigned: true }).notNull(),
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        excelFilePath: varchar("excel_file_path", { length: 500 }),
        excelRowCount: int("excel_row_count", { unsigned: true }).default(0),
        fieldMapping: json("field_mapping"),
        weightConfig: json("weight_config"),
        recommendQuestions: json("recommend_questions"),
        status: tinyint("status").notNull().default(0), // 0-Draft, 1-Published
        isDeleted: tinyint("is_deleted").notNull().default(0), // Compatible V2
        lockedBy: bigint("locked_by", { mode: "number", unsigned: true }),
        lockedAt: datetime("locked_at", { mode: "date" }),
        deletedAt: datetime("deleted_at", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        teacherIdIdx: index("idx_teacher_id").on(t.teacherId),
        statusIdx: index("idx_status").on(t.status),
        deletedIdx: index("idx_deleted").on(t.deletedAt),
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

export const topicAttachment = mysqlTable(
    "topic_attachment",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        topicId: bigint("topic_id", { mode: "number", unsigned: true }).notNull(),
        fileName: varchar("file_name", { length: 255 }).notNull(),
        filePath: varchar("file_path", { length: 500 }).notNull(),
        fileType: varchar("file_type", { length: 50 }).notNull(),
        fileSize: bigint("file_size", { mode: "number", unsigned: true }).notNull().default(0),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        topicIdIdx: index("idx_topic_id").on(t.topicId),
    })
);

export const topicAttachmentRelations = relations(topicAttachment, ({ one }) => ({
    topic: one(topic, {
        fields: [topicAttachment.topicId],
        references: [topic.id],
    }),
}));

export const task = mysqlTable(
    "task",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        topicId: bigint("topic_id", { mode: "number", unsigned: true }).notNull(),
        classId: bigint("class_id", { mode: "number", unsigned: true }).notNull(),
        openTime: datetime("open_time", { mode: "date" }),
        deadline: datetime("deadline", { mode: "date" }),
        deletedAt: datetime("deleted_at", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueTopicClass: uniqueIndex("uk_topic_class").on(t.topicId, t.classId),
        classIdIdx: index("idx_class_id").on(t.classId),
        deletedIdx: index("idx_deleted").on(t.deletedAt),
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

export const experiment = mysqlTable(
    "experiment",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        studentId: bigint("student_id", { mode: "number", unsigned: true }).notNull(),
        taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
        currentStage: tinyint("current_stage").notNull().default(0), // 0-4
        status: tinyint("status").notNull().default(0), // 0-Progress, 1-Submitted, ...
        questionnaire: json("questionnaire"),
        samplePlan: json("sample_plan"),
        samplingResults: json("sampling_results"),
        samplingDataPath: varchar("sampling_data_path", { length: 500 }),
        reportContent: text("report_content"),
        stage1CompletedAt: datetime("stage1_completed_at", { mode: "date" }),
        stage2CompletedAt: datetime("stage2_completed_at", { mode: "date" }),
        stage3CompletedAt: datetime("stage3_completed_at", { mode: "date" }),
        stage4CompletedAt: datetime("stage4_completed_at", { mode: "date" }),
        lastSavedAt: datetime("last_saved_at", { mode: "date" }),
        version: int("version", { unsigned: true }).notNull().default(1),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueStudentTask: uniqueIndex("uk_student_task").on(t.studentId, t.taskId),
        taskIdIdx: index("idx_task_id").on(t.taskId),
        statusIdx: index("idx_status").on(t.status),
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

export const submission = mysqlTable(
    "submission",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        experimentId: bigint("experiment_id", { mode: "number", unsigned: true }).notNull(),
        questionnairePdfPath: varchar("questionnaire_pdf_path", { length: 500 }),
        reportPdfPath: varchar("report_pdf_path", { length: 500 }),
        pdfSnapshotQuestionnaire: json("pdf_snapshot_questionnaire"),
        pdfSnapshotSamplingResults: json("pdf_snapshot_sampling_results"),
        pdfSnapshotSamplePlan: json("pdf_snapshot_sample_plan"),
        pdfSnapshotPopulationSize: int("pdf_snapshot_population_size", { unsigned: true }),
        pdfSnapshotReportContent: text("pdf_snapshot_report_content"),
        pdfSnapshotTopicName: varchar("pdf_snapshot_topic_name", { length: 200 }),
        pdfSnapshotStudentName: varchar("pdf_snapshot_student_name", { length: 100 }),
        pdfStatus: tinyint("pdf_status").notNull().default(0), // 0-Pending, 1-Generating, 2-Ready, 3-Failed
        pdfGenerationAttempts: int("pdf_generation_attempts", { unsigned: true }).notNull().default(0),
        pdfLastAttemptAt: datetime("pdf_last_attempt_at", { mode: "date" }),
        pdfGeneratedAt: datetime("pdf_generated_at", { mode: "date" }),
        pdfError: varchar("pdf_error", { length: 500 }),
        scoreQuestionnaire: decimal("score_questionnaire", { precision: 5, scale: 2 }),
        scoreProcess: decimal("score_process", { precision: 5, scale: 2 }),
        scoreReport: decimal("score_report", { precision: 5, scale: 2 }),
        totalScore: decimal("total_score", { precision: 5, scale: 2 }),
        teacherComment: text("teacher_comment"),
        rejectReason: text("reject_reason"),
        status: tinyint("status").notNull().default(1), // 0-Draft, 1-Pending, ...
        gradedByType: tinyint("graded_by_type"),
        gradedById: bigint("graded_by_id", { mode: "number", unsigned: true }),
        lockedByType: tinyint("locked_by_type"),
        lockedById: bigint("locked_by_id", { mode: "number", unsigned: true }),
        lockedAt: datetime("locked_at", { mode: "date" }),
        submittedAt: datetime("submitted_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        gradedAt: datetime("graded_at", { mode: "date" }),
    },
    (t) => ({
        experimentIdIdx: index("idx_experiment_id").on(t.experimentId),
        experimentSubmittedIdIdx: index("idx_experiment_submitted_id").on(t.experimentId, t.submittedAt, t.id),
        statusIdx: index("idx_status").on(t.status),
        pdfStatusAttemptIdx: index("idx_pdf_status_attempt").on(t.pdfStatus, t.pdfLastAttemptAt, t.id),
        lockedIdx: index("idx_locked").on(t.lockedAt),
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

export const announcement = mysqlTable(
    "announcement",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        title: varchar("title", { length: 100 }).notNull(),
        content: text("content").notNull(),
        targetScope: varchar("target_scope", { length: 20 }).notNull().default("all"),
        status: tinyint("status").notNull().default(1),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    },
    (t) => ({
        statusIdx: index("idx_status").on(t.status),
    })
);

export const announcementRead = mysqlTable(
    "announcement_read",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        announcementId: bigint("announcement_id", { mode: "number", unsigned: true }).notNull(),
        userType: tinyint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
        readAt: datetime("read_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        uniqueAnnouncementUser: uniqueIndex("uk_announcement_user").on(t.announcementId, t.userType, t.userId),
        userIdx: index("idx_user").on(t.userType, t.userId),
    })
);

export const loginLog = mysqlTable(
    "login_log",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        userType: tinyint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
        loginAt: datetime("login_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        ipAddress: varchar("ip_address", { length: 45 }),
        userAgent: varchar("user_agent", { length: 500 }),
    },
    (t) => ({
        userIdx: index("idx_user").on(t.userType, t.userId),
        loginAtIdx: index("idx_login_at").on(t.loginAt),
    })
);

export const systemMetrics = mysqlTable(
    "system_metrics",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        metricType: varchar("metric_type", { length: 50 }).notNull(),
        metricValue: decimal("metric_value", { precision: 10, scale: 2 }).notNull(),
        recordedAt: datetime("recorded_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        typeTimeIdx: index("idx_type_time").on(t.metricType, t.recordedAt),
    })
);

export const operationLog = mysqlTable(
    "operation_log",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        userType: tinyint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
        action: varchar("action", { length: 100 }).notNull(),
        targetType: varchar("target_type", { length: 50 }),
        targetId: bigint("target_id", { mode: "number", unsigned: true }),
        detail: json("detail"),
        ipAddress: varchar("ip_address", { length: 45 }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        userIdx: index("idx_user").on(t.userType, t.userId),
        actionIdx: index("idx_action").on(t.action),
        createdAtIdx: index("idx_created_at").on(t.createdAt),
    })
);

export const userSession = mysqlTable(
    "user_session",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
        userType: tinyint("user_type").notNull(),
        userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
        deviceInfo: varchar("device_info", { length: 500 }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
        expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
        lastActiveAt: datetime("last_active_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        userIdx: index("idx_user").on(t.userType, t.userId),
        expiresIdx: index("idx_expires").on(t.expiresAt),
    })
);

export const notification = mysqlTable(
    "notification",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        receiverType: tinyint("receiver_type").notNull(),
        receiverId: bigint("receiver_id", { mode: "number", unsigned: true }).notNull(),
        type: varchar("type", { length: 50 }).notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        content: text("content").notNull(),
        relatedType: varchar("related_type", { length: 50 }),
        relatedId: bigint("related_id", { mode: "number", unsigned: true }),
        isRead: tinyint("is_read").notNull().default(0),
        readAt: datetime("read_at", { mode: "date" }),
        createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => ({
        receiverIdx: index("idx_receiver").on(t.receiverType, t.receiverId, t.isRead),
        typeIdx: index("idx_type").on(t.type),
        createdAtIdx: index("idx_created").on(t.createdAt),
    })
);

export const systemConfig = mysqlTable(
    "system_config",
    {
        id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
        configKey: varchar("config_key", { length: 100 }).notNull().unique(),
        configValue: text("config_value").notNull(),
        valueType: varchar("value_type", { length: 20 }).notNull().default("string"),
        description: varchar("description", { length: 500 }),
        updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    }
);
