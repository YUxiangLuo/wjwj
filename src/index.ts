import { serve } from "bun";
import adminPage from "./admin/admin.html";
import teacherPage from "./teacher/teacher.html";
import studentPage from "./student/student.html";
import { adminApiRoutes } from "./admin/api";
import { studentApiRoutes } from "./student/api";
import { teacherApiRoutes } from "./teacher/api";
import { redirect } from "react-router-dom";
import { startBackgroundJobs } from "./server/background-jobs";
import { registerLongRunningProcessSignals } from "./server/process-signals";
import { getTemplateContentDisposition, getTemplateContentType, resolveTemplatePath } from "./server/template-files";
import { kickSubmissionPdfProcessing } from "./student/experiment/submission-pdf";

type RouteRequest = Request & { params: Record<string, string> };

const faviconResponse = () => new Response(Bun.file("public/favicon.svg"), {
  headers: {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=31536000, immutable",
  },
});

const routes = {
  "/": redirect("/student"),
  "/favicon.ico": faviconResponse,
  "/favicon.svg": faviconResponse,

  "/student": studentPage,
  "/student/*": studentPage,

  // Admin panel
  "/admin": adminPage,
  "/admin/*": adminPage,

  // Teacher panel
  "/teacher": teacherPage,
  "/teacher/*": teacherPage,

  // Admin API routes
  ...adminApiRoutes,

  // Student API routes
  ...studentApiRoutes,

  // Teacher API routes
  ...teacherApiRoutes,

  // Static templates (teacher upload guides and csv templates)
  "/templates/:name": async (req: RouteRequest) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const fileName = req.params.name ?? "";
    const fullPath = resolveTemplatePath(fileName);
    if (!fullPath) return new Response("Not Found", { status: 404 });

    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = {
      "Content-Type": getTemplateContentType(fileName),
      "Content-Disposition": getTemplateContentDisposition(fileName),
    };

    if (req.method === "HEAD") {
      return new Response(null, { headers });
    }

    return new Response(file, { headers });
  },
};

const server = serve({
  hostname: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT) || 3000,
  routes,

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);

// Recover pending submission PDFs even when the dedicated worker is not running.
kickSubmissionPdfProcessing();

const stopBackgroundJobs = startBackgroundJobs();

registerLongRunningProcessSignals({
    onShutdown: async () => {
        stopBackgroundJobs?.();
        // Graceful drain with a 5s timeout to avoid hanging on long-lived connections.
        const drain = server.stop();
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
        await Promise.race([drain, timeout]);
    },
});
