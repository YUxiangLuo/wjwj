import { expect, test } from "bun:test";
import { validateQuestionnaireForSubmit } from "@/student/experiment/submit-validation";
import { QUESTIONNAIRE_TEMPLATES } from "./questionnaire-templates";

test("built-in questionnaire templates satisfy the production submission contract", () => {
    expect(QUESTIONNAIRE_TEMPLATES).toHaveLength(3);
    for (const template of QUESTIONNAIRE_TEMPLATES) {
        expect(validateQuestionnaireForSubmit(template.questionnaire)).toBeNull();
        expect(new Set(template.questionnaire.questions.map((question) => question.section))).toEqual(
            new Set(["screening", "main", "background"]),
        );
    }
});
