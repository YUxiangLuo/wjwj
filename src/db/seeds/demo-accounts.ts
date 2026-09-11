import { DEMO_STUDENT_ACCOUNTS_SOURCE } from "./seed-identity";

export { DEMO_CLASS_NAME, DOGFOOD_ANCHORS, DOGFOOD_ROSTER, DOGFOOD_TEACHERS, type DemoStudentAccount } from "./seed-identity";

/** Every main-class student is eligible for the random demo-login prefill. */
export const DEMO_STUDENT_ACCOUNTS = DEMO_STUDENT_ACCOUNTS_SOURCE;
