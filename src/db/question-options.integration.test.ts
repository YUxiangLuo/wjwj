import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";
import { questionBindingSignature } from "@/domain/experiment/question-variable-binding";
import { validateQuestionAtIndex } from "@/lib/validate-question";
import type { Question } from "@/lib/questionnaire-types";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;
let db: SQL;
const statements = (await Bun.file(new URL("../../drizzle/postgresql/0004_question_options.sql", import.meta.url)).text()).split("--> statement-breakpoint");
const q = { id: "q", type: "single", content: "保留原题", options: ["10²", "102", " X ", "x"], optionIds: ["a", "b", "c", "d"] };
const signature = JSON.stringify([q.id, q.type, q.content, "main", q.options, q.optionIds, null, null, null, null, null, null]);
const bound = { ...q, variableBinding: { questionSignature: signature, answers: [{ answerId: "a", value: "01" }, { answerId: "b", value: 1 }, { answerId: "c", value: false }, { answerId: "d", value: 0 }] } };
const questionnaire = { title: "历史问卷", questions: [bound, { id: "unbound", type: "multiple", content: "未关联", options: ["甲", "乙"] }] };

beforeAll(async () => { if (required) { db = new SQL(url!, { max: 1 }); await assertTestDatabaseIsMigrated(db); } });
// Temporary tables shadow the names used by the real migration. Never update application rows in these tests.
beforeEach(async () => {
    if (!required) return;
    await db.unsafe("CREATE TEMP TABLE topic (id bigint, recommend_questions jsonb)");
    await db.unsafe("CREATE TEMP TABLE experiment (id bigint, questionnaire jsonb, submission_snapshot jsonb, report text, score numeric, version integer)");
    await db`INSERT INTO topic VALUES (1, ${[q]}::jsonb)`;
    await db`INSERT INTO experiment VALUES (2, ${questionnaire}::jsonb, ${{ questionnaire, dictionary: { revision: 3 }, report: "原报告", grade: 88 }}::jsonb, '原报告', 88, 9)`;
});
afterEach(async () => {
    if (!required) return;
    await db.unsafe("DROP TABLE IF EXISTS pg_temp.topic, pg_temp.experiment");
    await db.unsafe("DROP FUNCTION IF EXISTS pg_temp.wj_questionnaire_options(jsonb,text), pg_temp.wj_question_list(jsonb,text), pg_temp.wj_question_options(jsonb,text)");
});
afterAll(async () => { if (required) await db?.close(); });
async function migrate() { await db.begin(async tx => { for (const statement of statements) await tx.unsafe(statement); }); }
async function state() { return { topics: await db`SELECT * FROM topic`, experiments: await db`SELECT * FROM experiment` }; }

pgTest("option migration preserves labels, existing identities, signatures, submissions, reports, grades and CAS versions", async () => {
    await migrate();
    const after = await state(), row = after.experiments[0];
    const expected = { ...bound, options: q.options.map((label, i) => ({ id: q.optionIds[i], label })) } as Record<string, unknown>;
    delete expected.optionIds;
    expect(row.questionnaire.questions[0]).toEqual(expected);
    expect(row.submission_snapshot).toEqual({ questionnaire: row.questionnaire, dictionary: { revision: 3 }, report: "原报告", grade: 88 });
    expect(row.report).toBe("原报告"); expect(Number(row.score)).toBe(88); expect(row.version).toBe(9);
    expect(questionBindingSignature(row.questionnaire.questions[0] as Question)).toBe(signature);
    expect(validateQuestionAtIndex(row.questionnaire.questions[0], 1)).toBeNull();
    const allocated = row.questionnaire.questions[1].options;
    expect(new Set(allocated.map((option: { id: string }) => option.id)).size).toBe(2);
    expect(allocated[0].id).toMatch(/^o_m_[a-f0-9]{32}$/);
    expect(allocated.map((option: { label: string }) => option.label)).toEqual(["甲", "乙"]);
    expect(after.topics[0].recommend_questions[0].options).toEqual(expected.options);
});

pgTest("one malformed record rolls back every migration update and temporary helper creation", async () => {
    await db`INSERT INTO experiment VALUES (3, ${{ questions: [{ ...q, options: [1, 2] }] }}::jsonb, NULL, '保留', 91, 4)`;
    const before = await state();
    await expect(migrate()).rejects.toThrow("QUESTION_OPTIONS_MIGRATION");
    expect(await state()).toEqual(before);
    const functions = await db`SELECT p.oid FROM pg_proc p WHERE p.pronamespace=pg_my_temp_schema() AND p.proname='wj_question_options'`;
    expect(functions).toHaveLength(0);
});

pgTest("migration rejects ambiguous identities and never unpacks JSON strings or mixes shapes", async () => {
    for (const invalid of [
        { ...q, optionIds: ["a"] }, { ...q, optionIds: ["a", "a", "b", "c"] }, { ...q, optionIds: ["a", null, "b", "c"] },
        { ...q, optionIds: ["\t\u00a0\ufeff", "b", "c", "d"] }, { ...q, optionIds: ["😀".repeat(101), "b", "c", "d"] },
        { ...bound, optionIds: undefined }, { ...q, optionIds: null },
        { ...q, options: ["甲", { id: "b", label: "乙" }] }, { ...q, options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }] },
        { ...q, type: "boolean" }, { ...q, type: "future" },
    ]) {
        await db`UPDATE experiment SET questionnaire=${{ questions: [invalid] }}::jsonb`;
        const before = await state();
        await expect(migrate()).rejects.toThrow("QUESTION_OPTIONS_MIGRATION");
        expect(await state()).toEqual(before);
    }
    await db`UPDATE experiment SET questionnaire=${{ questions: JSON.stringify([q]) }}::jsonb`;
    const before = await state();
    await expect(migrate()).rejects.toThrow("QUESTION_OPTIONS_MIGRATION");
    expect(await state()).toEqual(before);
});

pgTest("migration is representation-only: no duplicate-label repair, rule normalization or optional metadata fabrication", async () => {
    const questions = [{ ...q, options: ["甲", " 甲 ", "Ａ", "A"] }, { id: "scale", type: "scale", content: "评分", scaleMin: 1.5, scaleMax: 5 }, { id: "numeric", type: "numeric", content: "数值", numberRule: { unit: "分钟", min: 0, max: 20, decimalPlaces: 2 } }];
    await db`UPDATE experiment SET questionnaire=${{ questions }}::jsonb, submission_snapshot=${{ report: "没有问卷快照" }}::jsonb`;
    await db`INSERT INTO topic VALUES (4, NULL)`;
    await migrate();
    const after = await state(), row = after.experiments[0];
    expect(row.questionnaire.questions[0].options.map((option: { label: string }) => option.label)).toEqual(["甲", " 甲 ", "Ａ", "A"]);
    expect(validateQuestionAtIndex(row.questionnaire.questions[0], 1)).toContain("重复");
    expect(row.questionnaire.questions.slice(1)).toEqual(questions.slice(1));
    expect(row.submission_snapshot).toEqual({ report: "没有问卷快照" });
    expect(after.topics.find((t: { id: string }) => Number(t.id) === 4).recommend_questions).toBeNull();
});

pgTest("target-format objects remain exact and malformed target objects fail atomically", async () => {
    const current = { id: "q", type: "single", content: "题目", options: [{ id: "😀".repeat(100), label: " 甲 " }, { id: "乙".repeat(200), label: "乙" }] };
    await db`UPDATE experiment SET questionnaire=${{ questions: [current] }}::jsonb, submission_snapshot=NULL`;
    await migrate(); expect((await state()).experiments[0].questionnaire).toEqual({ questions: [current] });
    await db.unsafe("DROP FUNCTION pg_temp.wj_questionnaire_options(jsonb,text), pg_temp.wj_question_list(jsonb,text), pg_temp.wj_question_options(jsonb,text)");
    for (const bad of [{ id: "a", label: "甲", answers: [1] }, { id: "b", label: 1 }, { id: "b" }]) {
        await db`UPDATE experiment SET questionnaire=${{ questions: [{ ...current, options: [bad, { id: "c", label: "乙" }] }] }}::jsonb`;
        const before = await state(); await expect(migrate()).rejects.toThrow("QUESTION_OPTIONS_MIGRATION"); expect(await state()).toEqual(before);
    }
});
