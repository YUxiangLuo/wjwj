/** 由结构化结果重算 CASES.md 的进度总览表，避免手工计数出错。 */
const files = ["O", "M", "I-P", "N-size", "N-design", "S-validation", "S-lifecycle"];
const cases: Array<{ id: string; checks: number; ok: boolean }> = [];
for (const f of files) {
  const j = JSON.parse(await Bun.file(`docs/dogfood/2026-09-13/results/${f}.json`).text());
  for (const s of j) cases.push({ id: s.id, checks: s.checks.length, ok: s.checks.every((c: any) => c.ok) });
}

const domains: Record<string, { real: string; plan: number }> = {
  I: { real: "DG-I 身份/会话", plan: 9 },
  S: { real: "DG-S 学生四阶段", plan: 18 },
  N: { real: "DG-N 统计与数值", plan: 16 },
  T: { real: "DG-T 教师闭环", plan: 14 },
  M: { real: "DG-M 管理端", plan: 11 },
  P: { real: "DG-P 权限矩阵", plan: 10 },
  F: { real: "DG-F 文件与上传", plan: 10 },
  C: { real: "DG-C 失败与并发", plan: 11 },
  L: { real: "DG-L 生命周期", plan: 8 },
  K: { real: "DG-K 容量与恢复", plan: 9 },
  X: { real: "DG-X 体验与无障碍", plan: 10 },
  O: { real: "DG-O 构建运维", plan: 10 },
};

const order = ["I", "S", "N", "T", "M", "P", "F", "C", "L", "K", "X", "O"];
const stats = Object.fromEntries(order.map((d) => [d, { executed: 0, pass: 0, fail: 0, checks: 0 }]));
for (const c of cases) {
  const d = c.id.split("-")[1]!;
  if (!stats[d]) continue;
  stats[d]!.executed += 1;
  stats[d]!.checks += c.checks;
  if (c.ok) stats[d]!.pass += 1; else stats[d]!.fail += 1;
}

const lines = [
  "| 域 | 计划用例 | 已执行 | PASS | FAIL | NOT_RUN | 已执行断言 |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
];
let tp = 0, te = 0, tpass = 0, tfail = 0, tchecks = 0;
for (const d of order) {
  const s = stats[d]!;
  const notRun = domains[d]!.plan - s.executed;
  tp += domains[d]!.plan; te += s.executed; tpass += s.pass; tfail += s.fail; tchecks += s.checks;
  lines.push(`| ${domains[d]!.real} | ${domains[d]!.plan} | ${s.executed} | ${s.pass} | ${s.fail} | ${notRun} | ${s.checks} |`);
}
lines.push(`| **合计** | **${tp}** | **${te}** | **${tpass}** | **${tfail}** | **${tp - te}** | **${tchecks}** |`);

const table = lines.join("\n");
const pid = "docs/dogfood/2026-09-13/CASES.md";
let doc = await Bun.file(pid).text();
const start = doc.indexOf("| 域 | 计划用例 |");
const end = doc.indexOf("\n\n", doc.indexOf("| **合计** |"));
doc = doc.slice(0, start) + table + doc.slice(end);
doc = doc.replace(/\*\*已执行部分：[^*]+\*\*/, `**已执行部分：${te} 个用例、${tchecks} 项断言、${tfail} 失败、0 缺陷**`);
await Bun.write(pid, doc);
console.log(table);
console.log(`\n写出：${te} 用例 / ${tchecks} 断言 / ${tfail} 失败`);
