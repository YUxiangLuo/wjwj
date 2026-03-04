export type RouteHandler = (req: Request) => Promise<Response> | Response;

export interface RouteDefinition {
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    DELETE?: RouteHandler;
}
