import { describe, expect, test } from "bun:test";
import { normalizeRecommendQuestionsFromDb } from "./questionnaire-normalize";

describe("normalizeRecommendQuestionsFromDb", () => {
    test("returns empty for null or undefined", () => {
        expect(normalizeRecommendQuestionsFromDb(null)).toEqual([]);
        expect(normalizeRecommendQuestionsFromDb(undefined)).toEqual([]);
    });

    test("parses JSON string", () => {
        const raw = JSON.stringify([
            { id: "a", type: "boolean", content: "是或否" },
        ]);
        const out = normalizeRecommendQuestionsFromDb(raw);
        expect(out).toHaveLength(1);
        expect(out[0]!.type).toBe("boolean");
        expect(out[0]!.content).toBe("是或否");
    });

    test("drops invalid entries but keeps valid ones", () => {
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            const out = normalizeRecommendQuestionsFromDb([
                { id: "1", type: "single", content: "ok", options: ["x", "y"] },
                { type: "single", content: "bad", options: ["only"] },
                { type: "bogus", content: "skip" },
            ]);
            expect(out).toHaveLength(1);
            expect(out[0]!.content).toBe("ok");
        } finally {
            console.warn = originalWarn;
        }
    });

    test("fills id when missing", () => {
        const out = normalizeRecommendQuestionsFromDb([{ type: "boolean", content: "无 id" }]);
        expect(out).toHaveLength(1);
        expect(out[0]!.id).toMatch(/^q_/);
    });

    test("preserves scale fields", () => {
        const out = normalizeRecommendQuestionsFromDb([
            {
                id: "s1",
                type: "scale",
                content: "满意度",
                scaleMin: 1,
                scaleMax: 7,
                scaleMinLabel: "低",
                scaleMaxLabel: "高",
            },
        ]);
        expect(out[0]).toMatchObject({
            scaleMin: 1,
            scaleMax: 7,
            scaleMinLabel: "低",
            scaleMaxLabel: "高",
        });
    });
});
