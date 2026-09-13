import { serve } from "bun";
import { routeTableWithMethodNotAllowed } from "./server/route-dispatch";
import { resolve } from "node:path";
import adminPage from "./admin/admin.html";
import teacherPage from "./teacher/teacher.html";
import studentPage from "./student/student.html";
import { adminApiRoutes } from "./admin/api";
import { studentApiRoutes } from "./student/api";
import { teacherApiRoutes } from "./teacher/api";
import { registerLongRunningProcessSignals } from "./server/process-signals";
import { getTemplateContentDisposition, getTemplateContentType, resolveTemplatePath } from "./server/template-files";
import { closeDatabase } from "./db";
import { analysisService } from "./student/experiment/analysis-service";
import { populationStatsService } from "./student/experiment/population-stats-service";
import { univariateService } from "./student/experiment/univariate-service";
import { acceptsGzip, createGzipCache } from "./server/asset-gzip";
import { buildResponseHeaders, handleServerError, validateApiRequest, withPrivateApiHeaders } from "./server/http";
import type { RouteDefinition, RouteHandler } from "./server/route-types";
import { resolveDemoMode } from "./lib/demo-mode";
import { createDemoStudentRoutes } from "./server/demo-student";

type RouteRequest = Request & { params: Record<string, string> };

const isProduction = process.env.NODE_ENV === "production";
const demoMode = resolveDemoMode(process.env);
const distRoot = resolve(import.meta.dir, "../dist");
const builtAssetNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const gzipCache = createGzipCache();

function securedResponse(body: BodyInit | null, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: buildResponseHeaders(init.headers),
  });
}

function productionPageRoute(fileName: "admin.html" | "teacher.html" | "student.html") {
  return async (req: Request) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return securedResponse("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const file = Bun.file(resolve(distRoot, fileName));
    if (!(await file.exists())) {
      return securedResponse("Production assets unavailable. Run bun run build.", { status: 503 });
    }

    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    };
    return securedResponse(req.method === "HEAD" ? null : file, { headers });
  };
}

async function productionAssetRoute(req: RouteRequest) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return securedResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const fileName = req.params.asset ?? "";
  if (!builtAssetNamePattern.test(fileName) || fileName.endsWith(".html")) {
    return securedResponse("Not Found", { status: 404 });
  }

  const file = Bun.file(resolve(distRoot, fileName));
  if (!(await file.exists())) return securedResponse("Not Found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const compressible = fileName.endsWith(".js") || fileName.endsWith(".css");
  if (!compressible || !acceptsGzip(req.headers.get("accept-encoding"))) {
    headers["Content-Length"] = String(file.size);
    return securedResponse(req.method === "HEAD" ? null : file, { headers });
  }

  const compressed = gzipCache.get(fileName, new Uint8Array(await file.arrayBuffer()));
  headers["Content-Encoding"] = "gzip";
  headers["Content-Length"] = String(compressed.byteLength);
  headers.Vary = "Accept-Encoding";
  return securedResponse(req.method === "HEAD" ? null : compressed.buffer, { headers });
}

const adminRoute = isProduction ? productionPageRoute("admin.html") : adminPage;
const teacherRoute = isProduction ? productionPageRoute("teacher.html") : teacherPage;
const studentRoute = isProduction ? productionPageRoute("student.html") : studentPage;
const productionAssetRoutes: Record<string, typeof productionAssetRoute> = isProduction
  ? { "/:asset": productionAssetRoute }
  : {};

function secureRouteHandler(handler: RouteHandler | undefined): RouteHandler | undefined {
  if (!handler) return undefined;
  return async (req) => {
    const rejected = validateApiRequest(req);
    return withPrivateApiHeaders(rejected ?? await handler(req));
  };
}

function secureApiRoutes(routeMap: Record<string, RouteDefinition>) {
  return Object.fromEntries(Object.entries(routeMap).map(([path, definition]) => {
    const secured: RouteDefinition = {};
    if (definition.GET) secured.GET = secureRouteHandler(definition.GET);
    if (definition.POST) secured.POST = secureRouteHandler(definition.POST);
    if (definition.PUT) secured.PUT = secureRouteHandler(definition.PUT);
    if (definition.DELETE) secured.DELETE = secureRouteHandler(definition.DELETE);
    return [path, secured];
  })) as Record<string, RouteDefinition>;
}

// 405 instead of 404 when a scripted client uses the wrong method on a real path.
const securedAdminApiRoutes = routeTableWithMethodNotAllowed(secureApiRoutes(adminApiRoutes));
const securedStudentApiRoutes = routeTableWithMethodNotAllowed(secureApiRoutes(studentApiRoutes));
const securedTeacherApiRoutes = routeTableWithMethodNotAllowed(secureApiRoutes(teacherApiRoutes));
const securedDemoApiRoutes = routeTableWithMethodNotAllowed(secureApiRoutes(createDemoStudentRoutes(demoMode)));

async function faviconRoute(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return securedResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const file = Bun.file(new URL("./favicon.svg", import.meta.url));
  const headers = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
  };
  return securedResponse(req.method === "HEAD" ? null : file, { headers });
}

function legacyFaviconRoute(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return securedResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }
  return securedResponse(null, {
    status: 308,
    headers: {
      Location: "/favicon.svg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

const routes = {
  "/": securedResponse(null, { status: 302, headers: { Location: "/student" } }),
  "/favicon.svg": faviconRoute,
  "/favicon.ico": legacyFaviconRoute,
  "/student": studentRoute,
  "/student/*": studentRoute,

  // Admin panel
  "/admin": adminRoute,
  "/admin/*": adminRoute,

  // Teacher panel
  "/teacher": teacherRoute,
  "/teacher/*": teacherRoute,

  // Production assets are built with absolute root URLs.
  ...productionAssetRoutes,

  // Admin API routes
  ...securedAdminApiRoutes,

  // Student API routes
  ...securedStudentApiRoutes,

  // Teacher API routes
  ...securedTeacherApiRoutes,

  // Demo-only unauthenticated credential prefill. This route is absent otherwise.
  ...securedDemoApiRoutes,

  // Static templates (teacher upload guides and csv templates)
  "/templates/:name": async (req: RouteRequest) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return securedResponse("Method Not Allowed", { status: 405 });
    }

    const fileName = req.params.name ?? "";
    const fullPath = resolveTemplatePath(fileName);
    if (!fullPath) return securedResponse("Not Found", { status: 404 });

    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return securedResponse("Not Found", { status: 404 });
    }

    const headers = {
      "Content-Type": getTemplateContentType(fileName),
      "Content-Disposition": getTemplateContentDisposition(fileName),
    };

    if (req.method === "HEAD") {
      return securedResponse(null, { headers });
    }

    return securedResponse(file, { headers });
  },
};

const server = serve({
  hostname: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT) || 3000,
  // Keep Bun's global ceiling explicit. Individual spreadsheet routes enforce 20 MiB.
  maxRequestBodySize: 128 * 1024 * 1024,
  // Allow the analysis queue/worker's 30-second deadline to return its JSON error.
  idleTimeout: 60,
  routes,
  error: handleServerError,

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
if (demoMode) console.warn("⚠️  DEMO_MODE=1：演示凭据端点已启用，请勿对外公开部署。");

registerLongRunningProcessSignals({
    onShutdown: async () => {
        // Graceful drain with a 5s timeout to avoid hanging on long-lived connections.
        const drain = server.stop();
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
        await Promise.race([drain, timeout]);
        analysisService.close();
        populationStatsService.close();
        univariateService.close();
        await closeDatabase();
    },
});
