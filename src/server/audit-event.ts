import { db } from "../db";
import { auditEvent } from "../db/schema";

export interface AuditEventInput {
    actorType: "admin" | "teacher" | "student" | "system";
    actorId: number;
    action: string;
    entityType: string;
    entityId: number;
    details?: Record<string, unknown>;
}

export function writeAuditEvent(client: Pick<typeof db, "insert">, input: AuditEventInput) {
    return client.insert(auditEvent).values({ ...input, details: input.details ?? {} });
}
