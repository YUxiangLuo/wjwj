/**
 * Student API Route Registry
 */

import { loginRoutes, logoutRoutes, meRoutes, passwordRoutes, sessionRoutes } from "./routes/auth";
import { experimentRoutes, resetRoutes, samplingActionRoutes, statsRoutes, submitRoutes } from "./routes/experiment";
import { attachmentDownloadRoutes, exportRoutes } from "./routes/files";
import {
    announcementReadRoutes,
    announcementsRoutes,
    notificationReadAllRoutes,
    notificationReadRoutes,
    notificationsRoutes,
} from "./routes/notifications";
import { submissionDetailRoutes, submissionDownloadRoutes, submissionsByTaskRoutes } from "./routes/submissions";
import { taskDetailRoutes, tasksRoutes } from "./routes/tasks";

export const studentApiRoutes = {
    // Auth
    "/api/student/login": loginRoutes,
    "/api/student/logout": logoutRoutes,
    "/api/student/password": passwordRoutes,

    // Me
    "/api/student/me": meRoutes,
    "/api/student/session": sessionRoutes,

    // Tasks
    "/api/student/tasks": tasksRoutes,
    "/api/student/tasks/:id": taskDetailRoutes,

    // Experiment
    "/api/student/tasks/:id/experiment": experimentRoutes,
    "/api/student/tasks/:id/sampling": samplingActionRoutes,
    "/api/student/tasks/:id/stats": statsRoutes,
    "/api/student/tasks/:id/submit": submitRoutes,
    "/api/student/tasks/:id/reset": resetRoutes,
    "/api/student/tasks/:id/export": exportRoutes,

    // Notifications
    "/api/student/notifications": notificationsRoutes,
    "/api/student/notifications/read-all": notificationReadAllRoutes,
    "/api/student/notifications/:id/read": notificationReadRoutes,

    // Announcements
    "/api/student/announcements": announcementsRoutes,
    "/api/student/announcements/:id/read": announcementReadRoutes,

    // Submissions
    "/api/student/tasks/:id/submissions": submissionsByTaskRoutes,
    "/api/student/submissions/:id": submissionDetailRoutes,
    "/api/student/submissions/:id/download": submissionDownloadRoutes,

    // Attachments
    "/api/student/attachments/:id/download": attachmentDownloadRoutes,
};
