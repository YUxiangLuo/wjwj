import { strict as assert } from "node:assert";
import { join } from "node:path";
import * as XLSX from "xlsx";

type Harness = {
    teacher: string;
    artifacts: string;
    workdir: string;
    browser: (session: string, ...args: string[]) => Promise<unknown>;
    evaluate: <T>(session: string, code: string) => Promise<T>;
    api: <T>(session: string, path: string, method?: string, body?: unknown) => Promise<T>;
    page: (session: string, path: string, selector: string) => Promise<void>;
    eventually: (check: () => Promise<unknown>, message: string) => Promise<void>;
};

// Native browser creation/publication complements the API/statistical matrix.
// Only GET requests are used for verification: no fixture template is created via API.
export async function teacherTemplateDogfood(h: Harness) {
    const { teacher, browser, evaluate, api, eventually } = h;
    const id = (value: string) => `[data-testid="${value}"]`;
    const click = async (selector: string) => {
        await browser(teacher, "scrollintoview", selector);
        await browser(teacher, "click", selector);
    };
    const fill = (selector: string, value: string) => browser(teacher, "fill", selector, value);
    const select = async (selector: string, label: string) => {
        await click(selector);
        await browser(teacher, "get", "text", '[role="listbox"]');
        await browser(teacher, "find", "role", "option", "click", "--name", label, "--exact");
    };
    const step = (n: number) => eventually(() => evaluate(teacher,
        `document.querySelector('${id(`teacher-topic-step-${n}`)}')?.getAttribute('aria-current')==='step'`), `Wizard step ${n}`);
    const next = async (n: number) => { await click(id("teacher-topic-next")); await step(n); };
    const classes = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/classes");
    assert.ok(classes.length >= 2, "Need two classes for hidden selection verification");
    const results: Array<{ name: string; format: string; target: unknown; methods: unknown; topicId: number; tasks: Array<{ id: number; classId: number }> }> = [];
    const profiles = [
        { name: "企业净利润", kind: "mean", requirements: ["必做", "必做", "必做"] },
        { name: "农业产量", kind: "mean", requirements: ["不适用", "必做", "不适用"] },
        { name: "环境浓度", kind: "mean", requirements: ["不适用", "不适用", "必做"] },
        { name: "医疗费用", kind: "mean", requirements: ["必做", "不适用", "不适用"] },
        { name: "绿色通勤", kind: "proportion", requirements: ["选做", "选做", "选做"] },
        { name: "罕见事件", kind: "proportion", requirements: ["不适用", "必做", "不适用"] },
        { name: "全员达标", kind: "proportion", requirements: ["不适用", "不适用", "必做"] },
        { name: "编码类别", kind: "proportion", requirements: ["必做", "不适用", "不适用"] },
        { name: "纯分类调查", kind: "proportion", requirements: ["必做", "不适用", "不适用"] },
    ] as const;
    for (const [p, profile] of profiles.entries()) for (const format of ["csv", "xlsx"] as const) {
        const name = `界面验收-${profile.name}-${format}`;
        console.log(`START ${name}`);
        const categoricalOnly = p === 8;
        const rows = Array.from({ length: 24 }, (_, i) => ({
            编号: String(i + 1).padStart(4, "0"),
            ...(!categoricalOnly ? {
                测量值: p === 0 ? i * 7 - 81 : p === 2 ? (i + .25) * 1e-6 : i * 3 + .5,
                规模: i === 23 ? 1000 : i % 5 + 1,
                分层: i < 3 ? "小层" : i < 9 ? "中层" : "大层",
            } : {}),
            类别: p === 6 ? "是" : p === 5 ? (i === 23 ? "是" : "否") : p === 7 ? (i % 2 ? " A " : "B") : (i % 3 ? "否" : "是"),
        }));
        const sheet = XLSX.utils.json_to_sheet(rows);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "总体");
        const path = join(h.workdir, `${name}.${format}`);
        await Bun.write(path, format === "csv" ? "\uFEFF" + XLSX.utils.sheet_to_csv(sheet) : XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
        await h.page(teacher, "/teacher/topic", id("teacher-topic-create-open"));
        await browser(teacher, "set", "viewport", "1024", "768", "2");
        await click(id("teacher-topic-create-open"));
        await fill(id("teacher-topic-name"), name);
        await next(2);
        await browser(teacher, "upload", id("teacher-topic-excel-file"), path);
        if (format === "csv") {
            await eventually(() => evaluate(teacher, `document.querySelector('${id("csv-review-confirm")}')?.disabled===false`), "CSV preview ready");
            await click(id("csv-review-confirm"));
        }
        await eventually(() => evaluate(teacher, `document.querySelector('${id("teacher-topic-next")}')?.disabled===false`), "Upload ready");
        await next(3);
        await select(id("teacher-topic-mapping-identifier"), "编号");
        if (!categoricalOnly) {
            for (const field of ["测量值", "规模"]) await browser(teacher, "check", id(`teacher-topic-mapping-numeric-${field}`));
            await browser(teacher, "check", id("teacher-topic-mapping-stratified-分层"));
        }
        await browser(teacher, "check", id("teacher-topic-mapping-others-类别"));
        await select(id("teacher-topic-analysis-kind"), profile.kind === "mean" ? "均值" : "比例");
        await select(id("teacher-topic-analysis-field"), profile.kind === "mean" ? "测量值" : "类别");
        if (profile.kind === "proportion") await select(id("teacher-topic-analysis-value"), p === 7 ? "A" : "是");
        await fill(id("teacher-contract-question"), `估计${profile.name}的${profile.kind === "mean" ? "平均值" : "目标类别比例"}`);
        await fill(id("teacher-contract-population"), "24个合成观测单位");
        await fill(id("teacher-contract-unit"), "一个观测单位");
        await fill("#teacher-field-search", "不存在的字段");
        assert.equal(await evaluate(teacher, `document.querySelector('${id("teacher-topic-next")}').disabled`), false, "Search must not unset mapping/target");
        await browser(teacher, "find", "role", "button", "click", "--name", "显示全部字段", "--exact");
        assert.equal(await evaluate(teacher, `document.querySelector('${id("teacher-topic-next")}').textContent.trim()`), "保存字段配置", "New fields must be persisted before dictionary confirmation");
        assert.equal(await evaluate(teacher, '[...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="明确确认并保存")?.disabled'), true, "Unsaved fields must block dictionary confirmation");
        await click(id("teacher-topic-next"));
        await eventually(() => evaluate(teacher, `!document.querySelector('${id("teacher-topic-save-mapping")}') && document.querySelector('${id("teacher-variable-dictionary")}')?.open && document.body.textContent.includes('字段配置已保存，请核对') && [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='明确确认并保存')?.disabled===false && document.querySelector('${id("teacher-topic-next")}')?.disabled===false`), "Saved fields must offer a usable dictionary confirmation before continuing");
        await step(3);
        // This matrix checks sampling configurations without optional single-variable
        // analysis; explicitly continue after reviewing the available dictionary step.
        await next(4);
        for (const [i, label] of ["系统抽样", "PPS抽样", "分层抽样"].entries()) {
            await select(`[aria-label="${label}要求"]`, profile.requirements[i]!);
        }
        if (format === "csv") await browser(teacher, "screenshot", join(h.artifacts, `matrix-${p}-policy.png`));
        await next(5);
        if (p === 0) {
            await browser(teacher, "upload", id("teacher-topic-attachment-file"), join(h.workdir, "public/templates/数据上传规范.pdf"));
            await eventually(() => evaluate(teacher, `Boolean(document.querySelector('[aria-label="删除附件：数据上传规范.pdf"]'))`), "Teaching attachment saved");
        }
        await next(6);
        if (p === 0) {
            await click(id("teacher-topic-question-add"));
            await click(id("student-question-type-boolean"));
            await fill(id("student-question-content"), "是否理解企业净利润的含义？");
            await click(id("student-question-save"));
            await eventually(() => evaluate(teacher, `!document.querySelector('${id("student-question-editor")}')`), "Question editor closed");
        }
        await next(7);
        for (const [key, value] of Object.entries({ questionnaire: 25, process: 31, report: 44 })) {
            await fill(id(`teacher-topic-weight-${key}`), String(value));
        }
        if (p === 0 && format === "csv") {
            await fill(id("teacher-topic-weight-report"), "43");
            await click(id("teacher-topic-finish"));
            await eventually(() => evaluate(teacher, `document.querySelector('${id("teacher-topic-save-error")}')?.textContent.includes('权重总和必须等于100')`), "Invalid weights remain editable");
            await step(7);
            await fill(id("teacher-topic-weight-report"), "44");
        }
        await click(id("teacher-topic-finish"));
        await eventually(() => evaluate(teacher, `!document.querySelector('[role=dialog]')`), "Wizard closed, including exit animation");
        const topic = (await api<Array<{ id: number; name: string; status: number }>>(teacher, "/api/teacher/topics")).find(t => t.name === name);
        assert.ok(topic);
        assert.equal(topic.status, 0);
        const detail = await api<{ topic: { fieldMapping: { studyContract: { target: unknown }; numeric: string[] }; samplingPolicy: { methods: unknown }; excelRowCount: number; weightConfig: unknown }; attachments: unknown[]; recommendQuestions: Array<{ content: string }> }>(teacher, `/api/teacher/topics/${topic.id}/detail`);
        const target = profile.kind === "mean" ? { kind: "mean", field: "测量值" } : { kind: "proportion", field: "类别", value: p === 7 ? "A" : "是" };
        assert.deepEqual(detail.topic.fieldMapping.studyContract.target, target);
        assert.equal(detail.topic.excelRowCount, 24);
        assert.deepEqual(detail.topic.weightConfig, { questionnaire: 25, process: 31, report: 44 });
        assert.equal(detail.attachments.length, p === 0 ? 1 : 0);
        assert.deepEqual(detail.recommendQuestions.map(q => q.content), p === 0 ? ["是否理解企业净利润的含义？"] : []);
        if (categoricalOnly) assert.deepEqual(detail.topic.fieldMapping.numeric, []);
        const requirementValues = { 必做: "required", 选做: "optional", 不适用: "disabled" };
        const methods = { simple: "required", ...Object.fromEntries(["systematic", "pps", "stratified"].map((m, i) => [m, requirementValues[profile.requirements[i]!]])) };
        assert.deepEqual(detail.topic.samplingPolicy.methods, methods);
        await click(id(`teacher-topic-publish-${topic.id}`));
        await eventually(() => evaluate(teacher, `document.querySelector('[role=alertdialog]')?.textContent.includes('检查通过')`), "Preflight ready");
        assert.equal((await api<{ topic: { status: number } }>(teacher, `/api/teacher/topics/${topic.id}/detail`)).topic.status, 0, "Preflight must be read-only");
        await browser(teacher, "find", "role", "button", "click", "--name", "确认", "--exact");
        await eventually(() => evaluate(teacher, `document.querySelector('[role=alertdialog]')?.textContent.includes('模板已发布')`), "Published");
        await click('[role="alertdialog"] a');
        await eventually(() => evaluate(teacher, `document.querySelector('${id("teacher-task-topic-select")}')?.textContent.includes(${JSON.stringify(name)})`), "Assignment preselection");
        for (const cls of classes.slice(0, 2)) {
            await fill('[aria-label="搜索班级"]', cls.name);
            await browser(teacher, "check", id(`teacher-task-class-check-${cls.id}`));
        }
        await fill('[aria-label="搜索班级"]', "不存在的班级");
        assert.ok(await evaluate(teacher, `document.querySelector('[role=dialog]').textContent.includes('已选 2 个班级')`), "Hidden selected classes retained");
        if (p === 0 && format === "csv") await browser(teacher, "screenshot", join(h.artifacts, "matrix-assignment-hidden-selected.png"));
        await click(id("teacher-task-publish-submit"));
        await eventually(() => evaluate(teacher, `!document.querySelector('${id("teacher-task-publish-submit")}')`), "Tasks published");
        const tasks = (await api<Array<{ id: number; topicId: number; classId: number }>>(teacher, "/api/teacher/tasks")).filter(t => t.topicId === topic.id);
        assert.deepEqual(tasks.map(t => t.classId).sort(), classes.slice(0, 2).map(c => c.id).sort(), "Exactly two intended classes, no duplicates");
        assert.equal((await api<{ topic: { status: number } }>(teacher, `/api/teacher/topics/${topic.id}/detail`)).topic.status, 1);
        results.push({ name, format, target, methods, topicId: topic.id, tasks });
        await Bun.write(join(h.artifacts, "template-matrix.json"), JSON.stringify(results, null, 2));
        console.log(`PASS ${name}: native seven-step creation, preflight, publication, two-class assignment`);
    }
    return results;
}
