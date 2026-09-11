/**
 * Seed identities with no imports of their own. The fixture helpers, the demo
 * login prefill and the integrity check all read this module, so a cycle between
 * them can never leave a binding in its temporal dead zone.
 */

export const DEMO_CLASS_NAME = "2026级统计学1班";

export interface DemoStudentAccount {
    studentId: string;
    name: string;
}

/** Teachers that own the demo classes, in creation order. */
export const DOGFOOD_TEACHERS = [
    { employeeId: "T001", name: "张岚" },
    { employeeId: "T002", name: "李文博" },
    { employeeId: "T003", name: "周妍" },
] as const;

/**
 * The roster is the single source for the seed, the demo-login prefill and the
 * integrity check, so a renamed student cannot silently pass verification.
 */
export const DOGFOOD_ROSTER = {
    main: [
        { studentId: "S2601", name: "林清" },
        { studentId: "S2602", name: "吴敏" },
        { studentId: "S2603", name: "郑华" },
        { studentId: "S2604", name: "孙琪" },
        { studentId: "S2605", name: "马丽" },
        { studentId: "S2606", name: "陈晨" },
        { studentId: "S2607", name: "何静" },
        { studentId: "S2608", name: "周宁" },
        { studentId: "S2609", name: "高远" },
        { studentId: "S2610", name: "许静" },
    ],
    secondary: [
        { studentId: "P2601", name: "赵一凡" },
        { studentId: "P2602", name: "钱思远" },
        { studentId: "P2603", name: "孙若溪" },
        { studentId: "P2604", name: "李安然" },
        { studentId: "P2605", name: "周嘉禾" },
        { studentId: "P2606", name: "吴书宁" },
    ],
    history: [
        { studentId: "H2501", name: "郑一鸣" },
        { studentId: "H2502", name: "王雪" },
        { studentId: "H2503", name: "李泽" },
        { studentId: "H2504", name: "陈曦" },
    ],
} as const;

/** Students the fixtures use as anchors, referenced by the seed and the check. */
export const DOGFOOD_ANCHORS = {
    stage1: "S2601",
    choicePair: "S2604",
    submitted: "S2605",
    graded: "S2606",
    rejected: "S2607",
    auditedSecondary: "P2602",
} as const;

/** Progress buckets the main task must cover exactly, shared by seed check and docs gate. */
/** Every main-class student is eligible for the random demo-login prefill. */

/** Every main-class student is eligible for the random demo-login prefill. */
export const DEMO_STUDENT_ACCOUNTS_SOURCE: readonly DemoStudentAccount[] = DOGFOOD_ROSTER.main;
