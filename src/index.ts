import { serve } from "bun";
import loginPage from "./login/login.html";
import adminPage from "./admin/admin.html";
import teacherPage from "./teacher/teacher.html";
import { adminApiRoutes } from "./admin/api";

const server = serve({
  routes: {
    // Admin panel
    "/admin": adminPage,
    "/admin/*": adminPage,

    // Teacher panel
    "/teacher": teacherPage,
    "/teacher/*": teacherPage,

    // Login page (default)
    "/": loginPage,
    "/login": loginPage,

    // Admin API routes
    ...adminApiRoutes,

    // API endpoints (example)
    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
