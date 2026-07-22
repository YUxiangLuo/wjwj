import { loginRoutes, logoutRoutes, meRoutes, passwordRoutes } from "./routes/auth";
import {
    analysisMetricsRoutes,
    experimentRoutes,
    samplingActionRoutes,
    stageCompleteRoutes,
    stageReopenRoutes,
    statsRoutes,
    submitRoutes,
} from "./routes/experiment";
import { attachmentDownloadRoutes, exportRoutes } from "./routes/files";
import { announcementsRoutes } from "./routes/announcements";
import { submissionByTaskRoutes } from "./routes/submissions";
import { taskDetailRoutes, tasksRoutes } from "./routes/tasks";

export const studentApiRoutes = {
    "/api/student/login": loginRoutes,
    "/api/student/logout": logoutRoutes,
    "/api/student/password": passwordRoutes,
    "/api/student/me": meRoutes,

    "/api/student/tasks": tasksRoutes,
    "/api/student/tasks/:id": taskDetailRoutes,
    "/api/student/tasks/:id/experiment": experimentRoutes,
    "/api/student/tasks/:id/experiment/stages/:stage/complete": stageCompleteRoutes,
    "/api/student/tasks/:id/experiment/stages/:stage/reopen": stageReopenRoutes,
    "/api/student/tasks/:id/sampling": samplingActionRoutes,
    "/api/student/tasks/:id/stats": statsRoutes,
    "/api/student/tasks/:id/analysis-metrics": analysisMetricsRoutes,
    "/api/student/tasks/:id/submit": submitRoutes,
    "/api/student/tasks/:id/export": exportRoutes,
    "/api/student/tasks/:id/submission": submissionByTaskRoutes,

    "/api/student/announcements": announcementsRoutes,
    "/api/student/attachments/:id/download": attachmentDownloadRoutes,
};
