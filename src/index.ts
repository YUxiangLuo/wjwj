import { serve } from "bun";
import adminPage from "./admin/admin.html";
import teacherPage from "./teacher/teacher.html";
import studentPage from "./student/student.html";
import { adminApiRoutes } from "./admin/api";
import { studentApiRoutes } from "./student/api";
import { teacherApiRoutes } from "./teacher/api";
import { redirect } from "react-router-dom";
import { registerLongRunningProcessSignals } from "./server/process-signals";
import { getTemplateContentDisposition, getTemplateContentType, resolveTemplatePath } from "./server/template-files";
import { closeDatabase } from "./db";

type RouteRequest = Request & { params: Record<string, string> };

async function faviconRoute(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const file = Bun.file(new URL("./favicon.svg", import.meta.url));
  const headers = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
  };
  return req.method === "HEAD" ? new Response(null, { headers }) : new Response(file, { headers });
}

function legacyFaviconRoute(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }
  return new Response(null, {
    status: 308,
    headers: {
      Location: "/favicon.svg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

const routes = {
  "/": redirect("/student"),
  "/favicon.svg": faviconRoute,
  "/favicon.ico": legacyFaviconRoute,
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

registerLongRunningProcessSignals({
    onShutdown: async () => {
        // Graceful drain with a 5s timeout to avoid hanging on long-lived connections.
        const drain = server.stop();
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
        await Promise.race([drain, timeout]);
        await closeDatabase();
    },
});
