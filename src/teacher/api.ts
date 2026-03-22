/**
 * Teacher API Routes
 * 教师端 API 接口集合
 */

import {
    teacherLoginRoutes,
    teacherLogoutRoutes,
    teacherMeRoutes,
    teacherPasswordRoutes,
    withPrimaryTeacherAuth,
    withTeacherAuth,
    withTeacherAuthAllowFirstLogin,
} from "./routes/auth";
import { gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes } from "./routes/export";
import { gradingDetailRoutes, gradingRoutes, teacherPdfDownloadRoutes } from "./routes/grading";
import { teacherNotificationReadAllRoutes, teacherNotificationReadRoutes, teacherNotificationsRoutes, teacherAnnouncementsRoutes, teacherAnnouncementReadRoutes } from "./routes/notifications";
import { dashboardRoutes } from "./routes/dashboard";
import {
    assistantClassAssignRoutes,
    assistantItemRoutes,
    assistantRoutes,
    classRoutes,
    classStudentsImportRoutes,
    classStudentsRoutes,
    studentRoutes,
} from "./routes/classroom";
import {
    taskExtendRoutes,
    taskItemRoutes,
    taskProgressRoutes,
    taskRoutes,
    topicAttachmentDeleteRoutes,
    topicAttachmentRoutes,
    topicCopyRoutes,
    topicDetailRoutes,
    topicExcelUploadRoutes,
    topicFieldMappingRoutes,
    topicItemRoutes,
    topicRecommendQuestionRoutes,
    topicRoutes,
    topicWeightRoutes,
} from "./routes/topic-task";

export const teacherApiRoutes = {
    // Auth
    "/api/teacher/login": teacherLoginRoutes,
    "/api/teacher/me": withTeacherAuthAllowFirstLogin(teacherMeRoutes),
    "/api/teacher/logout": teacherLogoutRoutes,
    "/api/teacher/password": withTeacherAuthAllowFirstLogin(teacherPasswordRoutes),

    "/api/teacher/dashboard": withPrimaryTeacherAuth(dashboardRoutes),
    "/api/teacher/classes": withPrimaryTeacherAuth(classRoutes),
    "/api/teacher/topics": withPrimaryTeacherAuth(topicRoutes),
    "/api/teacher/topics/:id": withPrimaryTeacherAuth(topicItemRoutes),
    "/api/teacher/topics/:id/detail": withPrimaryTeacherAuth(topicDetailRoutes),
    "/api/teacher/topics/:id/excel": withPrimaryTeacherAuth(topicExcelUploadRoutes),
    "/api/teacher/topics/:id/mapping": withPrimaryTeacherAuth(topicFieldMappingRoutes),
    "/api/teacher/topics/:id/attachments": withPrimaryTeacherAuth(topicAttachmentRoutes),
    "/api/teacher/topics/:id/attachments/:attachmentId": withPrimaryTeacherAuth(topicAttachmentDeleteRoutes),
    "/api/teacher/topics/:id/recommend-questions": withPrimaryTeacherAuth(topicRecommendQuestionRoutes),
    "/api/teacher/topics/:id/weights": withPrimaryTeacherAuth(topicWeightRoutes),
    "/api/teacher/topics/:id/copy": withPrimaryTeacherAuth(topicCopyRoutes),
    "/api/teacher/tasks": withPrimaryTeacherAuth(taskRoutes),
    "/api/teacher/tasks/:id": withPrimaryTeacherAuth(taskItemRoutes),
    "/api/teacher/tasks/:id/extend": withPrimaryTeacherAuth(taskExtendRoutes),
    "/api/teacher/tasks/:id/progress": withPrimaryTeacherAuth(taskProgressRoutes),
    "/api/teacher/grading": withTeacherAuth(gradingRoutes),
    "/api/teacher/grading/:id": withTeacherAuth(gradingDetailRoutes),
    "/api/teacher/notifications": withTeacherAuth(teacherNotificationsRoutes),
    "/api/teacher/notifications/read-all": withTeacherAuth(teacherNotificationReadAllRoutes),
    "/api/teacher/notifications/:id/read": withTeacherAuth(teacherNotificationReadRoutes),
    "/api/teacher/announcements": withTeacherAuth(teacherAnnouncementsRoutes),
    "/api/teacher/announcements/:id/read": withTeacherAuth(teacherAnnouncementReadRoutes),
    "/api/teacher/grade-export/preview": withPrimaryTeacherAuth(gradeExportPreviewRoutes),
    "/api/teacher/grade-export/data": withPrimaryTeacherAuth(gradeExportDataRoutes),
    "/api/teacher/grade-export/excel": withPrimaryTeacherAuth(gradeExportExcelRoutes),
    "/api/teacher/submissions/:id/pdf/:type": withTeacherAuth(teacherPdfDownloadRoutes),
    "/api/teacher/classes/:classId/students": withPrimaryTeacherAuth(classStudentsRoutes),
    "/api/teacher/classes/:classId/students/import": withPrimaryTeacherAuth(classStudentsImportRoutes),
    "/api/teacher/students/:id": withPrimaryTeacherAuth(studentRoutes),
    "/api/teacher/assistants": withPrimaryTeacherAuth(assistantRoutes),
    "/api/teacher/assistants/:id": withPrimaryTeacherAuth(assistantItemRoutes),
    "/api/teacher/assistants/:id/classes": withPrimaryTeacherAuth(assistantClassAssignRoutes),
};
