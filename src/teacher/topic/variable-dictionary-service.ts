import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { suggestDictionary, validateDictionary } from "../../domain/variables/dictionary";
import type { VariableDictionary } from "../../domain/variables/types";
import { canonicalJson, readVariableSource } from "../../server/variable-source";

function fail(message: string, code = "VALIDATION_ERROR", status = 400) {
    return { ok: false as const, message, code, status };
}

function dictionaryValue(value: VariableDictionary | string | null): VariableDictionary | null {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value) as VariableDictionary; } catch { return null; }
}

async function topicState(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], teacherId: number, topicId: number) {
    const [row] = await tx.select({
        id: topic.id, status: topic.status, excelFilePath: topic.excelFilePath,
        fieldMapping: topic.fieldMapping, variableDictionary: topic.variableDictionary,
        variableRevision: topic.variableRevision,
    }).from(topic).where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId))).for("update");
    if (!row) return null;
    const [assigned] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, topicId)).limit(1);
    return { ...row, locked: row.status === 1 || Boolean(assigned) };
}

export async function getTeacherVariableDictionary(params: { teacherId: number; topicId: number }) {
    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const state = await topicState(tx, params.teacherId, params.topicId);
        if (!state) return fail("实验模板不存在", "NOT_FOUND", 404);
        if (!state.excelFilePath) return fail("请先上传总体数据", "VARIABLE_SOURCE_MISSING", 400);
        const sourceData = await readVariableSource(state.excelFilePath, state.fieldMapping);
        const stored = dictionaryValue(state.variableDictionary);
        let confirmed: VariableDictionary | null = null;
        if (stored?.source === sourceData.source && stored.revision === state.variableRevision) {
            try { confirmed = validateDictionary(stored, sourceData.rows, sourceData.source); } catch { confirmed = null; }
        }
        const mapping = state.fieldMapping && typeof state.fieldMapping === "object"
            ? state.fieldMapping as { identifier?: unknown; numeric?: unknown }
            : {};
        const roleHints = {
            identifier: typeof mapping.identifier === "string" ? mapping.identifier : undefined,
            numeric: Array.isArray(mapping.numeric) && mapping.numeric.every(field => typeof field === "string")
                ? mapping.numeric as string[]
                : undefined,
        };
        return {
            ok: true as const,
            dictionary: confirmed,
            suggestion: suggestDictionary(sourceData.rows, sourceData.source, state.variableRevision, roleHints),
            source: sourceData.source,
            revision: state.variableRevision,
            locked: state.locked,
        };
    });
}

export async function putTeacherVariableDictionary(params: {
    teacherId: number;
    topicId: number;
    body: unknown;
}) {
    if (!params.body || typeof params.body !== "object" || Array.isArray(params.body)) return fail("请求格式无效");
    const body = params.body as Record<string, unknown>;
    const keys = Object.keys(body).sort();
    if (keys.join(",") !== "dictionary,observedRevision,source") return fail("请求字段不完整或含未知字段");
    if (typeof body.source !== "string" || !Number.isSafeInteger(body.observedRevision)) return fail("来源或修订号无效");

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const state = await topicState(tx, params.teacherId, params.topicId);
        if (!state) return fail("实验模板不存在", "NOT_FOUND", 404);
        if (state.locked) return fail("已发布或已分配任务的实验模板不能修改变量字典", "TOPIC_LOCKED", 409);
        if (!state.excelFilePath) return fail("请先上传总体数据", "VARIABLE_SOURCE_MISSING", 400);
        const sourceData = await readVariableSource(state.excelFilePath, state.fieldMapping);
        if (body.source !== sourceData.source) return fail("总体数据或字段解释已变化，请重新载入", "VARIABLE_SOURCE_CONFLICT", 409);
        if (body.observedRevision !== state.variableRevision) return fail("变量字典已被更新，请重新载入", "VARIABLE_REVISION_CONFLICT", 409);

        let incoming: VariableDictionary;
        try {
            incoming = validateDictionary(body.dictionary, sourceData.rows, sourceData.source);
        } catch (error) {
            return fail(error instanceof Error ? error.message : "变量字典无效");
        }
        if (incoming.revision !== state.variableRevision) return fail("变量字典修订号与观察版本不一致");
        const current = dictionaryValue(state.variableDictionary);
        if (current?.source === sourceData.source && canonicalJson(current.variables) === canonicalJson(incoming.variables)) {
            return { ok: true as const, revision: state.variableRevision };
        }
        const revision = state.variableRevision + 1;
        const dictionary = { ...incoming, revision };
        const [updated] = await tx.update(topic).set({ variableDictionary: dictionary, variableRevision: revision, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), eq(topic.variableRevision, state.variableRevision)))
            .returning({ id: topic.id });
        if (!updated) return fail("变量字典已被更新，请重新载入", "VARIABLE_REVISION_CONFLICT", 409);
        return { ok: true as const, revision };
    });
}
