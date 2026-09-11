import { and, eq, inArray } from "drizzle-orm";
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

/**
 * Non-reversible fingerprint kept after a deletion clears the entity's own audit
 * trail: the row can be matched again only by hashing a candidate identifier.
 */
export function hashEntityIdentifier(value: string) {
    return new Bun.CryptoHasher("sha256").update(value).digest("hex").slice(0, 16);
}

export function writeAuditEvent(client: Pick<typeof db, "insert">, input: AuditEventInput) {
    return client.insert(auditEvent).values({ ...input, details: input.details ?? {} });
}

export function deleteAuditEventsForEntities(
    client: Pick<typeof db, "delete">,
    entityType: string,
    entityIds: number[],
) {
    if (entityIds.length === 0) return Promise.resolve();
    return client.delete(auditEvent).where(and(
        eq(auditEvent.entityType, entityType),
        inArray(auditEvent.entityId, entityIds),
    ));
}

export function deleteAuditEventsForActor(
    client: Pick<typeof db, "delete">,
    actorType: AuditEventInput["actorType"],
    actorId: number,
) {
    return client.delete(auditEvent).where(and(
        eq(auditEvent.actorType, actorType),
        eq(auditEvent.actorId, actorId),
    ));
}
