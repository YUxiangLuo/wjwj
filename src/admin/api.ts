import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { class_, experiment, semester, student, task, teacher, topic } from "../db/schema";
import { json } from "../server/http";
import {
    adminLoginRoutes,
    adminLogoutRoutes,
    adminMeRoutes,
    adminPasswordRoutes,
    withAdminAuth,
} from "./routes/auth";
import {
    announcementPublishRoutes,
    announcementRoutes,
    announcementUnpublishRoutes,
    announcementUpdateRoutes,
    classRoutes,
    classUpdateRoutes,
    semesterCurrentRoutes,
    semesterDeleteRoutes,
    semesterRoutes,
    studentExperimentsRoutes,
    studentResetPasswordRoutes,
    studentRoutes,
    studentStatusRoutes,
    teacherResetPasswordRoutes,
    teacherRoutes,
    teacherStatusRoutes,
    teacherUpdateRoutes,
} from "./routes/management";
import { semesterUpdateRoutes } from "./routes/semester";

export const statsRoutes = {
    async GET() {
        const [[currentSemester], [teachers], [classes], [students], [pending]] = await Promise.all([
            db.select({ name: semester.name }).from(semester).where(eq(semester.isCurrent, 1)).limit(1),
            db.select({ count: count() }).from(teacher),
            db.select({ count: count() }).from(class_),
            db.select({ count: count() }).from(student),
            db.select({ count: count() })
                .from(experiment)
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .where(and(
                    eq(experiment.status, "submitted"),
                    eq(student.classId, task.classId),
                )),
        ]);

        return json({
            currentSemester: currentSemester?.name ?? "未设置",
            teacherCount: teachers?.count ?? 0,
            classCount: classes?.count ?? 0,
            studentCount: students?.count ?? 0,
            pendingItems: pending?.count ?? 0,
        });
    },
};

export const adminApiRoutes = {
    "/api/admin/login": adminLoginRoutes,
    "/api/admin/me": withAdminAuth(adminMeRoutes),
    "/api/admin/logout": adminLogoutRoutes,
    "/api/admin/password": withAdminAuth(adminPasswordRoutes),
    "/api/admin/stats": withAdminAuth(statsRoutes),

    "/api/admin/semesters": withAdminAuth(semesterRoutes),
    "/api/admin/semesters/:id/current": withAdminAuth(semesterCurrentRoutes),
    "/api/admin/semesters/:id": withAdminAuth(semesterDeleteRoutes),
    "/api/admin/semesters/:id/update": withAdminAuth(semesterUpdateRoutes),

    "/api/admin/teachers": withAdminAuth(teacherRoutes),
    "/api/admin/teachers/:id": withAdminAuth(teacherUpdateRoutes),
    "/api/admin/teachers/:id/status": withAdminAuth(teacherStatusRoutes),
    "/api/admin/teachers/:id/reset-password": withAdminAuth(teacherResetPasswordRoutes),

    "/api/admin/classes": withAdminAuth(classRoutes),
    "/api/admin/classes/:id": withAdminAuth(classUpdateRoutes),

    "/api/admin/students": withAdminAuth(studentRoutes),
    "/api/admin/students/:id/status": withAdminAuth(studentStatusRoutes),
    "/api/admin/students/:id/reset-password": withAdminAuth(studentResetPasswordRoutes),
    "/api/admin/students/:id/experiments": withAdminAuth(studentExperimentsRoutes),

    "/api/admin/announcements": withAdminAuth(announcementRoutes),
    "/api/admin/announcements/:id": withAdminAuth(announcementUpdateRoutes),
    "/api/admin/announcements/:id/publish": withAdminAuth(announcementPublishRoutes),
    "/api/admin/announcements/:id/unpublish": withAdminAuth(announcementUnpublishRoutes),
};
