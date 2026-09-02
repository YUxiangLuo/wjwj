export const DEMO_CLASS_NAME = "2024级统计学实验班";

export interface DemoStudentAccount {
    studentId: string;
    name: string;
}

/** Returning, enabled students eligible for random demo-login prefill. */
export const DEMO_STUDENT_ACCOUNTS: readonly DemoStudentAccount[] = [
    { studentId: "S010", name: "林清" },
    { studentId: "S012", name: "吴敏" },
    { studentId: "S013", name: "郑华" },
    { studentId: "S014", name: "孙琪" },
    { studentId: "S015", name: "马丽" },
    { studentId: "S016", name: "陈晨" },
    { studentId: "S017", name: "何静" },
];
