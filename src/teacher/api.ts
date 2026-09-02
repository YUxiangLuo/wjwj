import {
    teacherLoginRoutes,
    teacherLogoutRoutes,
    teacherMeRoutes,
    teacherPasswordRoutes,
    withTeacherAuth,
} from "./routes/auth";
import { classRoutes, classStudentsImportRoutes, classStudentsRoutes, studentRoutes } from "./routes/classroom";
import { dashboardRoutes } from "./routes/dashboard";
import { gradeAnalyticsRoutes, gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes } from "./routes/export";
import {
    gradingDetailRoutes,
    gradingRejectRoutes,
    gradingRoutes,
    gradingSamplingExportRoutes,
} from "./routes/grading";
import { teacherAnnouncementsRoutes } from "./routes/announcements";
import {
    taskExtendRoutes,
    taskItemRoutes,
    taskProgressRoutes,
    taskRoutes,
    topicAttachmentDeleteRoutes,
    topicAttachmentDownloadRoutes,
    topicAttachmentRoutes,
    topicCopyRoutes,
    topicDetailRoutes,
    topicExcelUploadRoutes,
    topicFieldMappingRoutes,
    topicItemRoutes,
    topicRecommendQuestionRoutes,
    topicSamplingPolicyRoutes,
    topicRoutes,
    topicWeightRoutes,
} from "./routes/topic-task";

export const teacherApiRoutes = {
    "/api/teacher/login": teacherLoginRoutes,
    "/api/teacher/logout": teacherLogoutRoutes,
    "/api/teacher/me": withTeacherAuth(teacherMeRoutes, { allowFirstLogin: true }),
    "/api/teacher/password": withTeacherAuth(teacherPasswordRoutes, { allowFirstLogin: true }),

    "/api/teacher/dashboard": withTeacherAuth(dashboardRoutes),
    "/api/teacher/classes": withTeacherAuth(classRoutes),
    "/api/teacher/classes/:classId/students": withTeacherAuth(classStudentsRoutes),
    "/api/teacher/classes/:classId/students/import": withTeacherAuth(classStudentsImportRoutes),
    "/api/teacher/students/:id": withTeacherAuth(studentRoutes),
    "/api/teacher/topics": withTeacherAuth(topicRoutes),
    "/api/teacher/topics/:id": withTeacherAuth(topicItemRoutes),
    "/api/teacher/topics/:id/detail": withTeacherAuth(topicDetailRoutes),
    "/api/teacher/topics/:id/excel": withTeacherAuth(topicExcelUploadRoutes),
    "/api/teacher/topics/:id/mapping": withTeacherAuth(topicFieldMappingRoutes),
    "/api/teacher/topics/:id/attachments": withTeacherAuth(topicAttachmentRoutes),
    "/api/teacher/topics/:id/attachments/:attachmentId": withTeacherAuth(topicAttachmentDeleteRoutes),
    "/api/teacher/topics/:id/attachments/:attachmentId/download": withTeacherAuth(topicAttachmentDownloadRoutes),
    "/api/teacher/topics/:id/recommend-questions": withTeacherAuth(topicRecommendQuestionRoutes),
    "/api/teacher/topics/:id/sampling-policy": withTeacherAuth(topicSamplingPolicyRoutes),
    "/api/teacher/topics/:id/weights": withTeacherAuth(topicWeightRoutes),
    "/api/teacher/topics/:id/copy": withTeacherAuth(topicCopyRoutes),
    "/api/teacher/tasks": withTeacherAuth(taskRoutes),
    "/api/teacher/tasks/:id": withTeacherAuth(taskItemRoutes),
    "/api/teacher/tasks/:id/extend": withTeacherAuth(taskExtendRoutes),
    "/api/teacher/tasks/:id/progress": withTeacherAuth(taskProgressRoutes),

    "/api/teacher/grading": withTeacherAuth(gradingRoutes),
    "/api/teacher/grading/:id": withTeacherAuth(gradingDetailRoutes),
    "/api/teacher/grading/:id/sampling-export": withTeacherAuth(gradingSamplingExportRoutes),
    "/api/teacher/grading/:id/reject": withTeacherAuth(gradingRejectRoutes),
    "/api/teacher/announcements": withTeacherAuth(teacherAnnouncementsRoutes),
    "/api/teacher/grade-export/preview": withTeacherAuth(gradeExportPreviewRoutes),
    "/api/teacher/grade-export/analytics": withTeacherAuth(gradeAnalyticsRoutes),
    "/api/teacher/grade-export/data": withTeacherAuth(gradeExportDataRoutes),
    "/api/teacher/grade-export/excel": withTeacherAuth(gradeExportExcelRoutes),
};
