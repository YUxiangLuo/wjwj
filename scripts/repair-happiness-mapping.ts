import { and, asc, count, eq, inArray } from "drizzle-orm";
import { validateDatabaseConfirmation } from "../src/db/destructive-confirmation";
import { experiment, task, teacher, topic } from "../src/db/schema";
import { acquireStorageMutationLock } from "../src/db/storage-mutation-lock";
import { DOGFOOD_NAMES, HAPPINESS_POPULATION_PATH } from "../src/db/seeds/dogfood-fixtures";
import { happinessFieldMapping } from "../src/db/seeds/happiness-topic";
import { validateDictionary } from "../src/domain/variables/dictionary";
import { canonicalJson, readVariableSource } from "../src/server/variable-source";

// Repair only the known v2 mapping during a maintenance window. Unlike the
// refresh script this never resets progress, changes files or revokes sessions.
async function repair() {
    if (process.env.DEMO_MODE !== "1") throw new Error("仅允许在 DEMO_MODE=1 的演示环境修复");
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => arg !== "--apply")) {
        throw new Error("用法：bun scripts/repair-happiness-mapping.ts [--apply]");
    }
    const apply = args.includes("--apply");
    if (apply) {
        const confirmation = validateDatabaseConfirmation(process.env.DATABASE_URL ?? "", process.env.CONFIRM_DATABASE_NAME);
        if (confirmation) throw new Error(confirmation);
    }

    // The only accepted predecessor differs in this one field's planning role.
    const oldMapping = structuredClone(happinessFieldMapping);
    oldMapping.numeric.push("社区服务满意度");
    oldMapping.others = oldMapping.others.filter(field => field !== "社区服务满意度");

    const { db, closeDatabase } = await import("../src/db");
    try {
        const result = await db.transaction(async tx => {
            await acquireStorageMutationLock(tx);
            const matches = await tx.select({
                id: topic.id, path: topic.excelFilePath, mapping: topic.fieldMapping,
                dictionary: topic.variableDictionary, revision: topic.variableRevision,
            }).from(topic).innerJoin(teacher, eq(teacher.id, topic.teacherId))
                .where(and(eq(topic.name, DOGFOOD_NAMES.topicA), eq(teacher.employeeId, "T001")))
                .for("update", { of: topic });
            if (matches.length !== 1) throw new Error("必须恰好匹配 T001 的一个青年幸福感演示课题");
            const selected = matches[0]!;
            // Parent locks also block new task/experiment inserts through FKs.
            const tasks = await tx.select({ id: task.id }).from(task)
                .where(eq(task.topicId, selected.id)).orderBy(asc(task.id)).for("update");
            const taskIds = tasks.map(row => row.id);
            const [existing] = taskIds.length
                ? await tx.select({ value: count() }).from(experiment).where(inArray(experiment.taskId, taskIds))
                : [{ value: 0 }];
            const experimentCount = existing!.value;
            const isOld = canonicalJson(selected.mapping) === canonicalJson(oldMapping);
            const isFixed = canonicalJson(selected.mapping) === canonicalJson(happinessFieldMapping);
            const blockedReasons: string[] = [];
            if (selected.path !== HAPPINESS_POPULATION_PATH) blockedReasons.push("总体文件不是已知 v2 seed 路径，拒绝覆盖");
            if (!isOld && !isFixed) blockedReasons.push("字段映射不是已知旧版或修复版，拒绝覆盖教师自定义内容");

            let nextDictionary: typeof selected.dictionary = null;
            if (blockedReasons.length === 0) {
                try {
                    const current = await readVariableSource(selected.path!, selected.mapping);
                    const dictionary = validateDictionary(selected.dictionary, current.rows, current.source);
                    if (dictionary.revision !== selected.revision) throw new Error("变量字典修订号与课题不一致");
                    if (isOld) {
                        if (experimentCount > 0) blockedReasons.push("课题已有学生实验，来源修复会使已有绑定或分析过期；拒绝修改且保留全部进度");
                        if (selected.revision >= 2_147_483_647) blockedReasons.push("变量字典修订号已达到数据库上限");
                        const next = await readVariableSource(selected.path!, happinessFieldMapping);
                        if (next.fileHash !== current.fileHash) throw new Error("校验期间总体文件发生变化，请停止写入后重试");
                        if (next.source === current.source) throw new Error("角色修复未改变数据来源摘要，拒绝执行");
                        nextDictionary = validateDictionary({
                            ...dictionary, source: next.source, revision: selected.revision + 1,
                        }, next.rows, next.source);
                    }
                } catch (cause) {
                    blockedReasons.push(cause instanceof Error ? cause.message : "总体文件或现有字典校验失败");
                }
            }
            const summary = {
                mode: apply ? "apply" : "preview", topicId: selected.id, taskIds,
                experimentCount, needsChange: isOld, currentRevision: selected.revision,
                nextRevision: nextDictionary?.revision ?? selected.revision,
                blockedReasons, updated: false,
            };
            if (!apply || blockedReasons.length || isFixed) return summary;
            if (!nextDictionary) throw new Error("缺少已验证的新变量字典");
            const updated = await tx.update(topic).set({
                fieldMapping: happinessFieldMapping,
                variableDictionary: nextDictionary,
                variableRevision: nextDictionary.revision,
                updatedAt: new Date(),
            }).where(and(eq(topic.id, selected.id), eq(topic.variableRevision, selected.revision)))
                .returning({ id: topic.id });
            if (updated.length !== 1) throw new Error("课题版本发生变化，修复已回滚");
            return { ...summary, updated: true };
        });
        // Successful output is emitted only after the transaction commits.
        console.log(JSON.stringify(result));
        if (apply && result.blockedReasons.length) throw new Error(`修复被阻止：${result.blockedReasons.join("；")}`);
    } finally {
        await closeDatabase();
    }
}

if (import.meta.main) {
    try { await repair(); }
    catch (cause) { console.error(cause); process.exitCode = 1; }
}
