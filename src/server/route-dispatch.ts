import type { RouteDefinition, RouteHandler } from "./route-types";
import { buildResponseHeaders } from "./http";

const METHOD_ORDER = ["GET", "HEAD", "POST", "PUT", "DELETE"] as const;

/**
 * Bun's router only matches the methods declared for a path, so a request that
 * uses the wrong method falls through to the generic 404 and reads as "no such
 * endpoint". Turning each definition into a single handler lets us answer 405
 * with an Allow header instead, which is what a scripted client needs to see.
 */
export function routeTableWithMethodNotAllowed(routeMap: Record<string, RouteDefinition>) {
    const allowedMethods = (definition: RouteDefinition) =>
        METHOD_ORDER.filter((method) => method === "HEAD"
            ? Boolean(definition.GET)
            : Boolean(definition[method])).join(", ");

    return Object.fromEntries(Object.entries(routeMap).map(([path, definition]) => [
        path,
        (req: Request) => {
            const method = req.method.toUpperCase();
            const handler = (method === "HEAD" ? undefined : definition[method as keyof RouteDefinition]) as RouteHandler | undefined;
            if (handler) return handler(req);
            // Browsers treat HEAD as GET without a body; keep that behaviour for read-only paths.
            if (method === "HEAD" && definition.GET) return definition.GET(req);
            return new Response("Method Not Allowed", {
                status: 405,
                headers: buildResponseHeaders({ Allow: allowedMethods(definition) }),
            });
        },
    ])) as Record<string, (req: Request) => Promise<Response> | Response>;
}
