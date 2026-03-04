/**
 * Teacher API Routes
 * 教师端 API 接口集合
 */

import {
    teacherLoginRoutes,
    teacherLogoutRoutes,
    teacherMeRoutes,
    teacherPasswordRoutes,
    withTeacherAuth,
} from "./routes/auth";
import { gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes } from "./routes/export";
import { gradingDetailRoutes, gradingRoutes, teacherPdfDownloadRoutes } from "./routes/grading";
import { teacherNotificationReadAllRoutes, teacherNotificationReadRoutes, teacherNotificationsRoutes } from "./routes/notifications";
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
    "/api/teacher/me": teacherMeRoutes,
    "/api/teacher/logout": teacherLogoutRoutes,
    "/api/teacher/password": withTeacherAuth(teacherPasswordRoutes),

    "/api/teacher/dashboard": withTeacherAuth(dashboardRoutes),
    "/api/teacher/classes": withTeacherAuth(classRoutes),
    "/api/teacher/topics": withTeacherAuth(topicRoutes),
    "/api/teacher/topics/:id": withTeacherAuth(topicItemRoutes),
    "/api/teacher/topics/:id/detail": withTeacherAuth(topicDetailRoutes),
    "/api/teacher/topics/:id/excel": withTeacherAuth(topicExcelUploadRoutes),
    "/api/teacher/topics/:id/mapping": withTeacherAuth(topicFieldMappingRoutes),
    "/api/teacher/topics/:id/attachments": withTeacherAuth(topicAttachmentRoutes),
    "/api/teacher/topics/:id/attachments/:attachmentId": withTeacherAuth(topicAttachmentDeleteRoutes),
    "/api/teacher/topics/:id/recommend-questions": withTeacherAuth(topicRecommendQuestionRoutes),
    "/api/teacher/topics/:id/weights": withTeacherAuth(topicWeightRoutes),
    "/api/teacher/topics/:id/copy": withTeacherAuth(topicCopyRoutes),
    "/api/teacher/tasks": withTeacherAuth(taskRoutes),
    "/api/teacher/tasks/:id/extend": withTeacherAuth(taskExtendRoutes),
    "/api/teacher/grading": withTeacherAuth(gradingRoutes),
    "/api/teacher/grading/:id": withTeacherAuth(gradingDetailRoutes),
    "/api/teacher/notifications": withTeacherAuth(teacherNotificationsRoutes),
    "/api/teacher/notifications/read-all": withTeacherAuth(teacherNotificationReadAllRoutes),
    "/api/teacher/notifications/:id/read": withTeacherAuth(teacherNotificationReadRoutes),
    "/api/teacher/grade-export/preview": withTeacherAuth(gradeExportPreviewRoutes),
    "/api/teacher/grade-export/data": withTeacherAuth(gradeExportDataRoutes),
    "/api/teacher/grade-export/excel": withTeacherAuth(gradeExportExcelRoutes),
    "/api/teacher/submissions/:id/pdf/:type": withTeacherAuth(teacherPdfDownloadRoutes),
    "/api/teacher/classes/:classId/students": withTeacherAuth(classStudentsRoutes),
    "/api/teacher/classes/:classId/students/import": withTeacherAuth(classStudentsImportRoutes),
    "/api/teacher/students/:id": withTeacherAuth(studentRoutes),
    "/api/teacher/assistants": withTeacherAuth(assistantRoutes),
    "/api/teacher/assistants/:id": withTeacherAuth(assistantItemRoutes),
    "/api/teacher/assistants/:id/classes": withTeacherAuth(assistantClassAssignRoutes),
};
