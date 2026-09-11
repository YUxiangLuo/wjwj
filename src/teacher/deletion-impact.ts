import type { SQL } from "drizzle-orm";
import { count } from "drizzle-orm";
import { db } from "../db";
import { experiment } from "../db/schema";

/**
 * What a hard delete will cascade away. Students and tasks are removed with
 * `ON DELETE CASCADE`, so the teacher has to see the numbers before the row
 * disappears; nothing in the database can bring them back afterwards.
 */
export type DeletionImpact = {
    experiments: number;
    submitted: number;
    graded: number;
};

export async function loadDeletionImpact(
    tx: Pick<typeof db, "select">,
    where: SQL | undefined,
): Promise<DeletionImpact> {
    const rows = await tx
        .select({ status: experiment.status, count: count() })
        .from(experiment)
        .where(where)
        .groupBy(experiment.status);
    const byStatus = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
        experiments: [...byStatus.values()].reduce((sum, value) => sum + value, 0),
        submitted: byStatus.get("submitted") ?? 0,
        graded: byStatus.get("graded") ?? 0,
    };
}

/** Work that has been handed in (submitted or graded) must be confirmed explicitly. */
export function deletionRequiresConfirmation(impact: DeletionImpact) {
    return impact.submitted > 0 || impact.graded > 0;
}
