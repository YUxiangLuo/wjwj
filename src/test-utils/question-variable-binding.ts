import type { Question, QuestionnaireData } from "@/lib/questionnaire-types";
import type { VariableDictionaryV1, VariableDefinition, VariableValue } from "@/domain/experiment/variable-dictionary";
import { questionAnswers, questionBindingSignature, type CategoricalQuestionBinding } from "@/domain/experiment/question-variable-binding";
export function bindingDictionary(): VariableDictionaryV1 {
    const variable = (id: string, sourceField: string, values: VariableValue[], extra: Partial<VariableDefinition> = {}): VariableDefinition => ({ id, sourceField, label: sourceField, storageType: "text", measurementLevel: "nominal", unit: "", missingValues: ["N/A"], categories: values.map(value => ({ value, label: String(value) })), ...extra });
    return { schemaVersion: 1, revision: 3, datasetRevision: "a".repeat(64), parserVersion: "spreadsheet-v2", variables: [
        variable("v_1", "编号", [], { measurementLevel: "id", missingValues: [] }),
        variable("v_2", " 分类 ", ["01", 1]), variable("v_3", "二值列", [false, true]),
        variable("v_4", "评分", [1, 2], { storageType: "number", measurementLevel: "ordinal" }),
        variable("v_5", "连续金额", [], { storageType: "number", measurementLevel: "continuous" }),
    ] };
}
export function bindingQuestion(): Question { return { id: "q1", type: "single", content: "请选择类别", options: ["甲类", "乙类"], optionIds: ["o_a", "o_b"] }; }
export function bindingFor(question = bindingQuestion(), dictionary = bindingDictionary(), variableId = "v_2"): CategoricalQuestionBinding {
    return { schemaVersion: 1, taskId: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision,
        questionSignature: questionBindingSignature(question), kind: question.type === "multiple" ? "multiple-binary" : "categorical",
        answers: questionAnswers(question).map((answer, index) => ({ answerId: answer.id, variableId, value: dictionary.variables.find(v => v.id === variableId)!.categories[index]!.value })),
    };
}
export function boundQuestionnaire(): QuestionnaireData {
    const question = bindingQuestion(); question.variableBinding = bindingFor(question);
    return { title: "关联测试", welcomeText: "欢迎参加本次调查，请认真填写所有问题，感谢配合。", endingText: "感谢您完成本次调查，您的回答仅用于课堂教学研究。",
        questions: [question, ...Array.from({ length: 4 }, (_, index): Question => ({ id: `other_${index}`, type: "boolean", content: "是否愿意参与？" }))] };
}
