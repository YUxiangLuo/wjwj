/**
 * Teacher API Routes
 * 教师端 API 接口集合
 */

import { db } from "../db";
import {
    teacher,
    class_,
    student,
    topic,
    task,
    submission,
    experiment,
    assistant,
    assistantClass,
    semester,
} from "../db/schema";
import { eq, desc, and, sql, count, or, like, isNull } from "drizzle-orm";

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

// ============================================================
// Dashboard Stats API
// ============================================================

const dashboardRoutes: RouteDefinition = {
    async GET(req) {
        // Assume teacher ID is 1 for now (T001) as we don't have auth middleware yet
        // In real app, we get this from session
        const currentTeacherId = 1;

        const [
            [myClasses],
            [myTopics],
            [pendingGrading],
            [activeTasks]
        ] = await Promise.all([
            db.select({ count: count() }).from(class_).where(eq(class_.teacherId, currentTeacherId)),
            db.select({ count: count() }).from(topic).where(eq(topic.teacherId, currentTeacherId)),
            db.select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(and(
                    eq(submission.status, 1), // 1 = Pending
                    eq(class_.teacherId, currentTeacherId)
                )),
            // Simplified task count: tasks assigned to my classes
            db.select({ count: count() })
                .from(task)
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(eq(class_.teacherId, currentTeacherId))
        ]);

        // Recent submissions
        // Complex join: Submission -> Experiment -> Student, Task -> Topic
        const recentSubs = await db.select({
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            submittedAt: submission.submittedAt
        })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .orderBy(desc(submission.submittedAt))
            .limit(5);

        return json({
            stats: [
                { label: "我的班级", value: myClasses?.count ?? 0 },
                { label: "我的课题", value: myTopics?.count ?? 0 },
                { label: "待批改作业", value: pendingGrading?.count ?? 0 },
                { label: "进行中任务", value: activeTasks?.count ?? 0 },
            ],
            recentSubmissions: recentSubs.map(sub => ({
                student: sub.studentName,
                class: sub.className,
                topic: sub.topicName,
                time: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "未知时间"
            }))
        });
    }
};

// ============================================================
// Export Routes
// ============================================================

// ============================================================
// Class API
// ============================================================

const classRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = 1; // TODO: from session
        const rows = await db
            .select({
                id: class_.id,
                name: class_.name,
                semester: semester.name,
                studentCount: count(student.id),
                createdAt: class_.createdAt,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt))) // only active students
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(class_.id)
            .orderBy(desc(class_.createdAt));

        return json(rows);
    }
};

const classStudentsRoutes: RouteDefinition = {
    async GET(req) {
        // /api/teacher/classes/:classId/students
        const url = new URL(req.url); // e.g., /api/teacher/classes/1/students
        const parts = url.pathname.split("/");
        // parts: ["", "api", "teacher", "classes", "1", "students"]
        const classId = Number(parts[4]);

        if (isNaN(classId)) return error("Invalid Class ID", "INVALID_ID");

        const rows = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                // email: student.email, // Not in schema
                status: student.status,
                lastLogin: sql<string>`(select max(login_at) from login_log where user_id = ${student.id} and user_type = 2)`,
            })
            .from(student)
            .where(and(eq(student.classId, classId), isNull(student.deletedAt)));

        return json(rows);
    },

    async POST(req) {
        // Add student
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const classId = Number(parts[4]);

        if (isNaN(classId)) return error("Invalid Class ID", "INVALID_ID");

        const body = await parseBody<{ studentId: string; name: string; email?: string }>(req);
        if (!body.studentId || !body.name) return error("Missing required fields", "VALIDATION_ERROR");

        // Check duplicate
        const [exist] = await db.select().from(student).where(eq(student.studentId, body.studentId));
        if (exist) return error("Student ID already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(student).values({
            studentId: body.studentId,
            name: body.name,
            classId: classId,
            password: defaultPassword,
            status: 1,
            isFirstLogin: 1,
            // email: body.email // Check if schema supports email
        });

        return json({ success: true }, 201);
    }
};

const studentRoutes: RouteDefinition = {
    async PUT(req) {
        // /api/teacher/students/:id
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const studentId = Number(parts[parts.length - 1]);

        const body = await parseBody<{ action: "reset_password" | "toggle_status" }>(req);

        if (body.action === "reset_password") {
            const newPassword = await Bun.password.hash("123456");
            await db.update(student).set({ password: newPassword, isFirstLogin: 1 }).where(eq(student.id, studentId));
        } else if (body.action === "toggle_status") {
            // Get current
            const [current] = await db.select({ status: student.status }).from(student).where(eq(student.id, studentId));
            if (current) {
                const newStatus = current.status === 1 ? 0 : 1;
                await db.update(student).set({ status: newStatus }).where(eq(student.id, studentId));
            }
        }

        return json({ success: true });
    },

    async DELETE(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const studentId = Number(parts[parts.length - 1]);

        await db.update(student).set({ deletedAt: new Date(), status: 0 }).where(eq(student.id, studentId));
        return json({ success: true });
    }
};

const assistantRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = 1;

        // Fetch assistants created by this teacher
        const assistants = await db
            .select()
            .from(assistant)
            .where(and(eq(assistant.creatorTeacherId, currentTeacherId), eq(assistant.status, 1)));

        // To get assigned classes, we can query separately or join.
        // Let's query relations for simplicity or one big query.

        const results = await Promise.all(assistants.map(async (ast) => {
            const classes = await db
                .select({ name: class_.name, id: class_.id })
                .from(assistantClass)
                .innerJoin(class_, eq(assistantClass.classId, class_.id))
                .where(eq(assistantClass.assistantId, ast.id));

            return {
                id: ast.id,
                name: ast.name,
                studentId: ast.account, // Mapping account to studentId for frontend consistency
                email: "",
                assignedClasses: classes.map(c => c.name),
                assignedClassIds: classes.map(c => c.id)
            };
        }));

        return json(results);
    },

    async POST(req) {
        const currentTeacherId = 1;
        const body = await parseBody<{ name: string; studentId: string }>(req); // studentId = account

        if (!body.name || !body.studentId) return error("Missing fields", "VALIDATION_ERROR");

        const [exist] = await db.select().from(assistant).where(eq(assistant.account, body.studentId));
        if (exist) return error("Account already exists", "DUPLICATE_ERROR");

        const defaultPassword = await Bun.password.hash("123456");

        await db.insert(assistant).values({
            name: body.name,
            account: body.studentId,
            password: defaultPassword,
            creatorTeacherId: currentTeacherId,
            status: 1
        });

        return json({ success: true }, 201);
    }
};

const assistantItemRoutes: RouteDefinition = {
    async DELETE(req) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        // Hard delete for now as planned
        await db.delete(assistant).where(eq(assistant.id, id));
        // Also delete relations
        await db.delete(assistantClass).where(eq(assistantClass.assistantId, id));

        return json({ success: true });
    }
};

const assistantClassAssignRoutes: RouteDefinition = {
    async POST(req) {
        // /api/teacher/assistants/:id/classes
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        // parts: ... assistants, :id, classes
        const assistantId = Number(parts[4]);

        const body = await parseBody<{ classIds: number[] }>(req);

        // Transaction to reset classes
        await db.transaction(async (tx) => {
            await tx.delete(assistantClass).where(eq(assistantClass.assistantId, assistantId));

            if (body.classIds && body.classIds.length > 0) {
                for (const classId of body.classIds) {
                    await tx.insert(assistantClass).values({
                        assistantId: assistantId,
                        classId: classId
                    });
                }
            }
        });

        return json({ success: true });
    }
};

// ============================================================
// Topic API
// ============================================================

const topicRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = 1;
        const rows = await db
            .select({
                id: topic.id,
                name: topic.name,
                description: topic.description,
                status: topic.status,
                dataRows: topic.excelRowCount,
                // Simple count of attachments (mock logic or real join if needed)
                // attachments: ... 
                createdAt: topic.createdAt,
            })
            .from(topic)
            .where(and(eq(topic.teacherId, currentTeacherId), eq(topic.isDeleted, 0)))
            .orderBy(desc(topic.createdAt));

        return json(rows);
    },

    async POST(req) {
        const currentTeacherId = 1;
        const body = await parseBody<{ name: string; description?: string; status?: number }>(req);

        if (!body.name?.trim()) return error("课题名称不能为空", "VALIDATION_ERROR");

        const [result] = await db.insert(topic).values({
            teacherId: currentTeacherId,
            name: body.name.trim(),
            description: body.description ?? "",
            status: body.status ?? 0, // Default draft
        });

        return json({ id: result.insertId }, 201);
    }
};

const topicItemRoutes: RouteDefinition = {
    async PUT(req) {
        // Update topic (rename, desc, status)
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        const body = await parseBody<{ name?: string; description?: string; status?: number }>(req);

        const updateData: any = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.status !== undefined) updateData.status = body.status;

        if (Object.keys(updateData).length === 0) return json({ success: true });

        await db.update(topic).set(updateData).where(eq(topic.id, id));
        return json({ success: true });
    },

    async DELETE(req) {
        // Soft delete
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = Number(parts[parts.length - 1]);

        await db.update(topic).set({ isDeleted: 1, deletedAt: new Date() }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

// ============================================================
// Task API
// ============================================================

const taskRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = 1;
        // List tasks created for my classes
        const rows = await db
            .select({
                id: task.id,
                topic: topic.name,
                className: class_.name,
                publishedAt: task.openTime,
                deadline: task.deadline,
                total: count(student.id), // Approximate total
                completed: sql<number>`0`, // Placeholder
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, eq(student.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(task.id)
            .orderBy(desc(task.createdAt));

        // Note: Accurately counting 'completed' (experiments submitted) requires subqueries or separate calls
        // For simplicity, we stick to basic info or optimize later.

        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ topicId: number; classIds: number[]; deadline?: string }>(req);

        if (!body.topicId || !body.classIds?.length) {
            return error("请选择课题和班级", "VALIDATION_ERROR");
        }

        const deadlineDate = body.deadline ? new Date(body.deadline) : null;

        // Loop insert
        for (const cid of body.classIds) {
            await db.insert(task).values({
                topicId: body.topicId,
                classId: cid,
                openTime: new Date(),
                deadline: deadlineDate
            });
        }

        return json({ success: true }, 201);
    }
};

// ============================================================
// Grading API
// ============================================================

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = 1;
        const params = getSearchParams(req);

        // Check if ID is provided in URL path (handled by router wrapper usually, but here we might need to parse from URL if using simple objects)
        // Wait, the current router implementation (server.ts) likely matches prefixes.
        // If we want /api/teacher/grading/:id, we need to handle it.
        // For simplicity with the current map-based router, we might need a separate route entry or regex matching in server.ts.
        // BUT, looking at server.ts (assumed), it matches exact paths.
        // Let's add a new route entry for details.

        const status = params.get("status"); // 'pending', 'graded', etc.

        let query = db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                topic: topic.name,
                className: class_.name,
                submittedAt: submission.submittedAt,
                status: submission.status,
                score: submission.totalScore
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .orderBy(desc(submission.submittedAt))
            .$dynamic();

        if (status === "pending") {
            // 1 = Pending
            query = query.where(eq(submission.status, 1));
        } else if (status === "graded") {
            // 2 = Graded
            query = query.where(eq(submission.status, 2));
        }

        const rows = await query;
        return json(rows);
    }
};

const gradingDetailRoutes: RouteDefinition = {
    async GET(req) {
        // Parse ID from URL: /api/teacher/grading/123
        const urlForId = new URL(req.url);
        const pathParts = urlForId.pathname.split("/");
        const submissionId = Number(pathParts[pathParts.length - 1]);

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const [row] = await db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                className: class_.name,
                topicName: topic.name,
                topicDesc: topic.description,
                status: submission.status,
                submittedAt: submission.submittedAt,
                // Experiment Data
                reportContent: experiment.reportContent,
                samplePlan: experiment.samplePlan,
                questionnaire: experiment.questionnaire,
                // Grading Info
                scoreQuestionnaire: submission.scoreQuestionnaire,
                scoreProcess: submission.scoreProcess,
                scoreReport: submission.scoreReport,
                totalScore: submission.totalScore,
                teacherComment: submission.teacherComment,
                gradedAt: submission.gradedAt
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(submission.id, submissionId));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        return json(row);
    },

    async POST(req) {
        const urlForId = new URL(req.url);
        const pathParts = urlForId.pathname.split("/");
        const submissionId = Number(pathParts[pathParts.length - 1]);

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{
            scoreQuestionnaire: number;
            scoreProcess: number;
            scoreReport: number;
            totalScore: number;
            comment: string;
            status: number;
        }>(req);

        await db.update(submission).set({
            scoreQuestionnaire: String(body.scoreQuestionnaire),
            scoreProcess: String(body.scoreProcess),
            scoreReport: String(body.scoreReport),
            totalScore: String(body.totalScore),
            teacherComment: body.comment,
            status: body.status,
            gradedAt: new Date(),
            gradedById: 1, // TODO: current teacher
            gradedByType: 1
        }).where(eq(submission.id, submissionId));

        return json({ success: true });
    }
};

export const teacherApiRoutes = {
    "/api/teacher/dashboard": dashboardRoutes,
    "/api/teacher/classes": classRoutes,
    "/api/teacher/topics": topicRoutes,
    "/api/teacher/topics/:id": topicItemRoutes,
    "/api/teacher/tasks": taskRoutes,
    "/api/teacher/grading": gradingRoutes,
    "/api/teacher/grading/:id": gradingDetailRoutes,
    "/api/teacher/classes/:classId/students": classStudentsRoutes,
    "/api/teacher/students/:id": studentRoutes,
    "/api/teacher/assistants": assistantRoutes,
    "/api/teacher/assistants/:id": assistantItemRoutes,
    "/api/teacher/assistants/:id/classes": assistantClassAssignRoutes,
};

// Note: The simple router in `src/index.ts` likely maps exact paths. 
// We may need to update `src/index.ts` to handle dynamic routes or simply register all IDs if we can't change the router.
// FOR NOW: We will rely on a hack: The router might need to be smart enough or we register a regex.
// Looking at `src/index.ts` (implied), it's a map. 
// Let's modify export to include a wildcard handler if possible, otherwise we need to rely on the router logic.
// Checking `src/index.ts` would be ideal. Assuming standard Bun server, we can match prefixes.

