import { afterEach, beforeEach, expect, test } from "bun:test";
import { questionBindingSignature } from "@/domain/experiment/question-variable-binding";
import { installDomGlobals } from "@/test-utils/dom";
import { bindingDictionary, boundQuestionnaire } from "@/test-utils/question-variable-binding";
const bootstrap = installDomGlobals();
const { render, cleanup } = await import("@testing-library/react");
const { QuestionnaireSnapshot } = await import("./QuestionnaireSnapshot");
bootstrap.restore(); let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 0)); restore(); });
test("grading/submission materials show typed source links from the supplied snapshot dictionary", () => {
    const view = render(<QuestionnaireSnapshot questionnaire={boundQuestionnaire()} variableDictionary={bindingDictionary()} />);
    expect(view.getByText(/提交字典修订 3/)).toBeTruthy();
    expect(view.getByText('甲类 → " 分类 " · 文本 "01"')).toBeTruthy();
    expect(view.getByText('乙类 → " 分类 " · 数值 1')).toBeTruthy();
    expect(view.getAllByText("仅认知预试，未关联已有变量。")).toHaveLength(4);
});
test("numeric snapshot shows the actual continuous field and explicit trial rules, not answer codes", () => {
    const dictionary = bindingDictionary(); const questionnaire = boundQuestionnaire();
    const question = questionnaire.questions[0]!;
    questionnaire.questions[0] = { id: question.id, type: "numeric", content: "实际金额？", numberRule: { unit: "", min: 0, max: null, decimalPlaces: 2 } };
    questionnaire.questions[0]!.variableBinding = { schemaVersion: 1, kind: "continuous", taskId: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision, questionSignature: questionBindingSignature(questionnaire.questions[0]!), variableId: "v_5" };
    const view = render(<QuestionnaireSnapshot questionnaire={questionnaire} variableDictionary={dictionary} />);
    expect(view.getByText(/连续变量 →/).textContent).toContain('"连续金额"');
    expect(view.getByText(/最多 2 位小数/)).toBeTruthy(); expect(view.queryByRole("alert")).toBeNull();
});
test("missing historical dictionary is never replaced by an invented confirmation", () => {
    const view = render(<QuestionnaireSnapshot questionnaire={boundQuestionnaire()} />);
    expect(view.getByText(/请在关联编辑器或包含字典的提交快照中核对/)).toBeTruthy();
    expect(view.queryByText(/提交字典修订/)).toBeNull();
});
test("incompatible and malformed snapshot dictionaries produce visible warnings, not links", () => {
    const view = render(<QuestionnaireSnapshot questionnaire={boundQuestionnaire()} variableDictionary={{ ...bindingDictionary(), revision: 4 }} />);
    expect(view.getByRole("alert").textContent).toContain("已改变");
    view.rerender(<QuestionnaireSnapshot questionnaire={boundQuestionnaire()} variableDictionary={{ schemaVersion: 99 } as any} />);
    expect(view.getByRole("alert").textContent).toContain("提交字典版本无法核对");
});
