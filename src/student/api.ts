/**
 * Student API Routes
 * 学生端 API 接口集合
 */

import { db } from "../db";
import {
    student,
    task,
    topic,
    topicAttachment,
    topicRecommendQuestion,
    experiment,
    submission,
    notification,
    announcement,
    announcementRead,
    class_,
    userSession,
} from "../db/schema";
import { eq, desc, and, sql, isNull, count } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

type RouteHandler = (req: Request) => Promise<Response> | Response;

interface RouteDefinition {
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    DELETE?: RouteHandler;
}

// Experiment status
const ExperimentStatus = {
    IN_PROGRESS: 0,
    SUBMITTED: 1,
    GRADING: 2,
    GRADED: 3,
    REJECTED: 4,
} as const;

// ============================================================
// Helpers
// ============================================================

function json<T>(data: T, status = 200): Response {
    return Response.json({ success: true, data }, { status });
}

function error(message: string, code: string, status = 400): Response {
    return Response.json({ success: false, error: { code, message } }, { status });
}

async function parseBody<T>(req: Request): Promise<T> {
    return req.json() as Promise<T>;
}

function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
}

function getPathParam(req: Request, position: number): string {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    return parts[parts.length - position] ?? "";
}

// 开发模式：是否跳过认证
const DEV_MODE = process.env.NODE_ENV !== "production";

// 从 session token 获取当前学生
async function getCurrentStudent(req: Request) {
    // 从 cookie 或 header 获取 session token
    const cookies = req.headers.get("cookie") ?? "";
    const sessionMatch = cookies.match(/session=([^;]+)/);
    const sessionToken = sessionMatch?.[1] ?? req.headers.get("x-session-token");

    if (sessionToken) {
        // 查询 session
        const [session] = await db
            .select()
            .from(userSession)
            .where(
                and(
                    eq(userSession.sessionToken, sessionToken),
                    eq(userSession.userType, 4), // 4 = student
                    sql`${userSession.expiresAt} > NOW()`
                )
            );

        if (session) {
            // 查询学生信息
            const [s] = await db
                .select({
                    id: student.id,
                    studentId: student.studentId,
                    name: student.name,
                    classId: student.classId,
                    status: student.status,
                })
                .from(student)
                .where(and(eq(student.id, session.userId), isNull(student.deletedAt)));

            if (s) return s;
        }
    }

    // 开发模式：尝试获取第一个学生作为测试账号
    if (DEV_MODE) {
        const [firstStudent] = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                classId: student.classId,
                status: student.status,
            })
            .from(student)
            .where(isNull(student.deletedAt))
            .limit(1);

        if (firstStudent) {
            return firstStudent;
        }
    }

    return null;
}

// 要求登录的中间件风格检查
async function requireAuth(req: Request) {
    const currentStudent = await getCurrentStudent(req);
    if (!currentStudent) {
        // 开发模式下返回更友好的错误信息
        if (DEV_MODE) {
            return { student: null, error: error("数据库中没有学生数据，请先通过管理端添加学生", "NO_STUDENT_DATA", 401) };
        }
        return { student: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }
    if (currentStudent.status !== 1) {
        return { student: null, error: error("账号已被禁用", "ACCOUNT_DISABLED", 403) };
    }
    return { student: currentStudent, error: null };
}

// ============================================================
// Me API - 当前用户信息
// ============================================================

const meRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取班级信息
        const [classInfo] = await db
            .select({
                className: class_.name,
            })
            .from(class_)
            .where(eq(class_.id, currentStudent.classId));

        return json({
            id: currentStudent.id,
            studentId: currentStudent.studentId,
            name: currentStudent.name,
            classId: currentStudent.classId,
            className: classInfo?.className ?? null,
        });
    },
};

// ============================================================
// Tasks API - 任务列表
// ============================================================

const tasksRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取当前学生班级的所有任务
        const tasks = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                // Topic info
                topicName: topic.name,
                topicDescription: topic.description,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(
                and(
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt),
                    eq(topic.status, 1) // 已发布的课题
                )
            )
            .orderBy(desc(task.createdAt));

        // 获取每个任务对应的实验状态
        const taskIds = tasks.map((t) => t.id);
        const experiments =
            taskIds.length > 0
                ? await db
                      .select({
                          taskId: experiment.taskId,
                          currentStage: experiment.currentStage,
                          status: experiment.status,
                          lastSavedAt: experiment.lastSavedAt,
                      })
                      .from(experiment)
                      .where(
                          and(
                              eq(experiment.studentId, currentStudent.id),
                              sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`
                          )
                      )
                : [];

        const experimentMap = new Map(experiments.map((e) => [e.taskId, e]));

        // 获取提交信息（成绩、驳回原因）
        const experimentIds = experiments.map((e) => e.taskId);
        const submissions =
            experimentIds.length > 0
                ? await db
                      .select({
                          experimentId: submission.experimentId,
                          totalScore: submission.totalScore,
                          rejectReason: submission.rejectReason,
                          status: submission.status,
                      })
                      .from(submission)
                      .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                      .where(
                          and(
                              eq(experiment.studentId, currentStudent.id),
                              sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`
                          )
                      )
                      .orderBy(desc(submission.submittedAt))
                : [];

        // 按 experimentId 分组，取最新的
        const submissionMap = new Map<number, (typeof submissions)[0]>();
        for (const sub of submissions) {
            if (!submissionMap.has(sub.experimentId)) {
                submissionMap.set(sub.experimentId, sub);
            }
        }

        // 组装返回数据
        const result = tasks.map((t) => {
            const exp = experimentMap.get(t.id);
            const sub = exp ? submissionMap.get(exp.taskId) : null;

            // 计算状态
            let status: string;
            let progress = 0;

            if (!exp) {
                status = "not_started";
            } else if (exp.status === ExperimentStatus.REJECTED) {
                status = "rejected";
                progress = 100;
            } else if (exp.status === ExperimentStatus.GRADED) {
                status = "graded";
                progress = 100;
            } else if (exp.status === ExperimentStatus.GRADING) {
                status = "grading";
                progress = 100;
            } else if (exp.status === ExperimentStatus.SUBMITTED) {
                status = "submitted";
                progress = 100;
            } else {
                status = "in_progress";
                progress = Math.round((exp.currentStage / 4) * 100);
            }

            return {
                id: t.id,
                topicId: t.topicId,
                name: t.topicName,
                description: t.topicDescription,
                publishedAt: t.openTime?.toISOString().split("T")[0] ?? t.createdAt.toISOString().split("T")[0],
                deadline: t.deadline?.toISOString().split("T")[0] ?? null,
                status,
                progress,
                currentStage: exp?.currentStage ?? 0,
                score: sub?.totalScore ? Number(sub.totalScore) : undefined,
                rejectReason: sub?.rejectReason ?? undefined,
            };
        });

        return json(result);
    },
};

// ============================================================
// Task Detail API - 任务详情
// ============================================================

const taskDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 1));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 获取任务信息
        const [taskInfo] = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                topicName: topic.name,
                topicDescription: topic.description,
                excelRowCount: topic.excelRowCount,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt)
                )
            );

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        // 获取附件
        const attachments = await db
            .select({
                id: topicAttachment.id,
                fileName: topicAttachment.fileName,
                fileType: topicAttachment.fileType,
                fileSize: topicAttachment.fileSize,
            })
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, taskInfo.topicId));

        // 获取推荐问题
        const recommendQuestions = await db
            .select({
                id: topicRecommendQuestion.id,
                questionType: topicRecommendQuestion.questionType,
                content: topicRecommendQuestion.content,
                options: topicRecommendQuestion.options,
                sortOrder: topicRecommendQuestion.sortOrder,
            })
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, taskInfo.topicId))
            .orderBy(topicRecommendQuestion.sortOrder);

        // 获取实验状态
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        // 获取提交信息
        let submissionInfo = null;
        if (exp) {
            const [sub] = await db
                .select()
                .from(submission)
                .where(eq(submission.experimentId, exp.id))
                .orderBy(desc(submission.submittedAt))
                .limit(1);
            submissionInfo = sub ?? null;
        }

        // 计算状态
        let status: string;
        if (!exp) {
            status = "not_started";
        } else if (exp.status === ExperimentStatus.REJECTED) {
            status = "rejected";
        } else if (exp.status === ExperimentStatus.GRADED) {
            status = "graded";
        } else if (exp.status === ExperimentStatus.GRADING) {
            status = "grading";
        } else if (exp.status === ExperimentStatus.SUBMITTED) {
            status = "submitted";
        } else {
            status = "in_progress";
        }

        return json({
            id: taskInfo.id,
            topicId: taskInfo.topicId,
            name: taskInfo.topicName,
            description: taskInfo.topicDescription,
            publishedAt: taskInfo.openTime?.toISOString().split("T")[0] ?? taskInfo.createdAt.toISOString().split("T")[0],
            deadline: taskInfo.deadline?.toISOString().split("T")[0] ?? null,
            populationSize: taskInfo.excelRowCount ?? 10000,
            attachments: attachments.map((a) => ({
                id: a.id,
                name: a.fileName,
                type: a.fileType,
                size: a.fileSize,
            })),
            recommendQuestions,
            status,
            currentStage: exp?.currentStage ?? 0,
            score: submissionInfo?.totalScore ? Number(submissionInfo.totalScore) : undefined,
            rejectReason: submissionInfo?.rejectReason ?? undefined,
        });
    },
};

// ============================================================
// Experiment API - 实验数据
// ============================================================

const experimentRoutes: RouteDefinition = {
    // 获取实验数据
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 验证任务属于当前学生的班级
        const [taskInfo] = await db
            .select({ id: task.id, topicId: task.topicId })
            .from(task)
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt)
                )
            );

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        // 获取或创建实验记录
        let [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            // 创建新的实验记录
            try {
                const [result] = await db.insert(experiment).values({
                    studentId: currentStudent.id,
                    taskId: taskId,
                    currentStage: 0,
                    status: ExperimentStatus.IN_PROGRESS,
                });

                [exp] = await db.select().from(experiment).where(eq(experiment.id, result.insertId));
            } catch (e: unknown) {
                // 如果是重复键错误，说明记录已存在，重新查询
                if (e && typeof e === "object" && "code" in e && e.code === "ER_DUP_ENTRY") {
                    [exp] = await db
                        .select()
                        .from(experiment)
                        .where(
                            and(
                                eq(experiment.studentId, currentStudent.id),
                                eq(experiment.taskId, taskId)
                            )
                        );
                } else {
                    throw e;
                }
            }
        }

        if (!exp) {
            return error("创建实验记录失败", "CREATE_FAILED", 500);
        }

        // 获取课题的总体规模
        const [topicInfo] = await db
            .select({ excelRowCount: topic.excelRowCount })
            .from(topic)
            .where(eq(topic.id, taskInfo.topicId));

        return json({
            id: exp.id,
            taskId: exp.taskId,
            currentStage: exp.currentStage,
            status: exp.status,
            questionnaire: exp.questionnaire,
            samplePlan: exp.samplePlan,
            samplingResults: exp.samplingResults,
            reportContent: exp.reportContent,
            lastSavedAt: exp.lastSavedAt?.toISOString() ?? null,
            populationSize: topicInfo?.excelRowCount ?? 10000,
        });
    },

    // 保存实验数据
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const body = await parseBody<{
            currentStage?: number;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
        }>(req);

        // 获取实验记录
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        // 检查是否可以编辑（未提交或被驳回）
        if (exp.status !== ExperimentStatus.IN_PROGRESS && exp.status !== ExperimentStatus.REJECTED) {
            return error("实验已提交，无法修改", "ALREADY_SUBMITTED");
        }

        // 构建更新数据
        const updates: Record<string, unknown> = {
            lastSavedAt: new Date(),
            version: exp.version + 1,
        };

        if (body.currentStage !== undefined) {
            updates.currentStage = body.currentStage;

            // 记录阶段完成时间
            if (body.currentStage >= 1 && !exp.stage1CompletedAt) {
                updates.stage1CompletedAt = new Date();
            }
            if (body.currentStage >= 2 && !exp.stage2CompletedAt) {
                updates.stage2CompletedAt = new Date();
            }
            if (body.currentStage >= 3 && !exp.stage3CompletedAt) {
                updates.stage3CompletedAt = new Date();
            }
            if (body.currentStage >= 4 && !exp.stage4CompletedAt) {
                updates.stage4CompletedAt = new Date();
            }
        }

        if (body.questionnaire !== undefined) {
            updates.questionnaire = body.questionnaire;
        }
        if (body.samplePlan !== undefined) {
            updates.samplePlan = body.samplePlan;
        }
        if (body.samplingResults !== undefined) {
            updates.samplingResults = body.samplingResults;
        }
        if (body.reportContent !== undefined) {
            updates.reportContent = body.reportContent;
        }

        // 如果之前是被驳回状态，重新保存后变为进行中
        if (exp.status === ExperimentStatus.REJECTED) {
            updates.status = ExperimentStatus.IN_PROGRESS;
        }

        await db.update(experiment).set(updates).where(eq(experiment.id, exp.id));

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

// ============================================================
// Submit API - 提交实验
// ============================================================

const submitRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 获取实验记录
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        // 检查是否可以提交
        if (exp.status === ExperimentStatus.SUBMITTED || exp.status === ExperimentStatus.GRADING) {
            return error("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
        }
        if (exp.status === ExperimentStatus.GRADED) {
            return error("实验已批改完成", "ALREADY_GRADED");
        }

        // 检查是否完成所有阶段
        if (exp.currentStage < 4) {
            return error("请完成所有实验阶段后再提交", "INCOMPLETE");
        }

        // 检查报告内容
        if (!exp.reportContent || exp.reportContent.length < 100) {
            return error("报告内容不能少于100字", "REPORT_TOO_SHORT");
        }

        // 更新实验状态
        await db
            .update(experiment)
            .set({ status: ExperimentStatus.SUBMITTED })
            .where(eq(experiment.id, exp.id));

        // 创建提交记录
        await db.insert(submission).values({
            experimentId: exp.id,
            status: 1, // Pending
            submittedAt: new Date(),
        });

        return json({ success: true });
    },
};

// ============================================================
// Notifications API - 通知
// ============================================================

const notificationsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notifications = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
                relatedType: notification.relatedType,
                relatedId: notification.relatedId,
            })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, 4), // 4 = student
                    eq(notification.receiverId, currentStudent.id)
                )
            )
            .orderBy(desc(notification.createdAt))
            .limit(50);

        // 统计未读数量
        const [unreadCount] = await db
            .select({ count: count() })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id),
                    eq(notification.isRead, 0)
                )
            );

        return json({
            notifications,
            unreadCount: unreadCount?.count ?? 0,
        });
    },
};

const notificationReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notificationId = parseInt(getPathParam(req, 2));
        if (!notificationId) {
            return error("无效的通知ID", "INVALID_ID");
        }

        // 更新为已读
        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.id, notificationId),
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id)
                )
            );

        return json({ success: true });
    },
};

// 标记所有通知为已读
const notificationReadAllRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id),
                    eq(notification.isRead, 0)
                )
            );

        return json({ success: true });
    },
};

// ============================================================
// Announcements API - 公告
// ============================================================

const announcementsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取已发布的公告
        const announcements = await db
            .select({
                id: announcement.id,
                title: announcement.title,
                content: announcement.content,
                createdAt: announcement.createdAt,
            })
            .from(announcement)
            .where(eq(announcement.status, 1))
            .orderBy(desc(announcement.createdAt))
            .limit(20);

        // 获取已读状态
        const announcementIds = announcements.map((a) => a.id);
        const readRecords =
            announcementIds.length > 0
                ? await db
                      .select({ announcementId: announcementRead.announcementId })
                      .from(announcementRead)
                      .where(
                          and(
                              eq(announcementRead.userType, 4),
                              eq(announcementRead.userId, currentStudent.id),
                              sql`${announcementRead.announcementId} IN (${sql.join(announcementIds, sql`, `)})`
                          )
                      )
                : [];

        const readSet = new Set(readRecords.map((r) => r.announcementId));

        const result = announcements.map((a) => ({
            ...a,
            isRead: readSet.has(a.id),
        }));

        return json(result);
    },
};

const announcementReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const announcementId = parseInt(getPathParam(req, 2));
        if (!announcementId) {
            return error("无效的公告ID", "INVALID_ID");
        }

        // 检查是否已读
        const [existing] = await db
            .select()
            .from(announcementRead)
            .where(
                and(
                    eq(announcementRead.announcementId, announcementId),
                    eq(announcementRead.userType, 4),
                    eq(announcementRead.userId, currentStudent.id)
                )
            );

        if (!existing) {
            await db.insert(announcementRead).values({
                announcementId,
                userType: 4,
                userId: currentStudent.id,
            });
        }

        return json({ success: true });
    },
};

// ============================================================
// Attachment Download API - 附件下载
// ============================================================

const attachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const attachmentId = parseInt(getPathParam(req, 2));
        if (!attachmentId) {
            return error("无效的附件ID", "INVALID_ID");
        }

        // 获取附件信息
        const [att] = await db
            .select()
            .from(topicAttachment)
            .where(eq(topicAttachment.id, attachmentId));

        if (!att) {
            return error("附件不存在", "NOT_FOUND", 404);
        }

        // TODO: 实际下载逻辑，返回文件流
        // 这里先返回文件路径信息
        return json({
            id: att.id,
            fileName: att.fileName,
            filePath: att.filePath,
            fileType: att.fileType,
            fileSize: att.fileSize,
        });
    },
};

// ============================================================
// Export Routes
// ============================================================

export const studentApiRoutes = {
    // Me
    "/api/student/me": meRoutes,

    // Tasks
    "/api/student/tasks": tasksRoutes,
    "/api/student/tasks/:id": taskDetailRoutes,

    // Experiment
    "/api/student/tasks/:id/experiment": experimentRoutes,
    "/api/student/tasks/:id/submit": submitRoutes,

    // Notifications
    "/api/student/notifications": notificationsRoutes,
    "/api/student/notifications/read-all": notificationReadAllRoutes,
    "/api/student/notifications/:id/read": notificationReadRoutes,

    // Announcements
    "/api/student/announcements": announcementsRoutes,
    "/api/student/announcements/:id/read": announcementReadRoutes,

    // Attachments
    "/api/student/attachments/:id/download": attachmentDownloadRoutes,
};
