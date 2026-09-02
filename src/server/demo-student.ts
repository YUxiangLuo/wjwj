import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { class_, student } from "@/db/schema";
import {
    DEMO_CLASS_NAME,
    DEMO_STUDENT_ACCOUNTS,
    type DemoStudentAccount,
} from "@/db/seeds/demo-accounts";
import { error, json } from "@/server/http";
import type { RouteDefinition } from "@/server/route-types";
import { verifyPassword } from "@/server/password-work";

interface DemoStudentRow {
    studentId: string;
    name: string;
    passwordHash: string;
    lockedUntil: Date | null;
}

interface DemoStudentRouteDependencies {
    loadCandidates: () => Promise<DemoStudentRow[]>;
    random: () => number;
    verifyPassword: (password: string, hash: string) => Promise<boolean>;
}

const accountByStudentId = new Map(
    DEMO_STUDENT_ACCOUNTS.map((account) => [account.studentId, account]),
);

export function orderedDemoCandidates(
    rows: readonly DemoStudentRow[],
    randomValue: number,
): Array<{ row: DemoStudentRow; account: DemoStudentAccount }> {
    const now = Date.now();
    const candidates = rows.flatMap((row) => {
        const account = accountByStudentId.get(row.studentId);
        if (!account || (row.lockedUntil?.getTime() ?? 0) > now) return [];
        return [{ row, account }];
    });
    if (candidates.length < 2) return candidates;

    const normalized = Number.isFinite(randomValue)
        ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
        : 0;
    const start = Math.floor(normalized * candidates.length);
    return [...candidates.slice(start), ...candidates.slice(0, start)];
}

async function loadDemoStudentCandidates(): Promise<DemoStudentRow[]> {
    return db
        .select({
            studentId: student.studentId,
            name: student.name,
            passwordHash: student.password,
            lockedUntil: student.lockedUntil,
        })
        .from(student)
        .innerJoin(class_, eq(student.classId, class_.id))
        .where(and(
            eq(class_.name, DEMO_CLASS_NAME),
            eq(student.status, 1),
            eq(student.isFirstLogin, 0),
            isNull(student.deletedAt),
        ));
}

const defaultDependencies: DemoStudentRouteDependencies = {
    loadCandidates: loadDemoStudentCandidates,
    random: Math.random,
    verifyPassword,
};

export function createDemoStudentRoutes(
    enabled: boolean,
    dependencies: DemoStudentRouteDependencies = defaultDependencies,
): Record<string, RouteDefinition> {
    if (!enabled) return {};

    return {
        "/api/demo/student-credential": {
            async GET() {
                const candidates = orderedDemoCandidates(
                    await dependencies.loadCandidates(),
                    dependencies.random(),
                );
                for (const { row, account } of candidates) {
                    if (row.name !== account.name) continue;
                    if (await dependencies.verifyPassword(account.password, row.passwordHash)) {
                        return json(
                            { studentId: account.studentId, password: account.password },
                            200,
                            { "Cache-Control": "no-store" },
                        );
                    }
                }
                return error("演示班级中没有可用的学生账号", "DEMO_STUDENT_UNAVAILABLE", 503);
            },
        },
    };
}
