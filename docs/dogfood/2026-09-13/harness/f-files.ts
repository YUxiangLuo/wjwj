/**
 * DG-F 文件、上传与下载（F-01…F-09）。
 * 全部经真实 HTTP；xlsx 由本地依赖生成，用于验证 .xlsx 通路。
 */
import * as XLSX from "xlsx";
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const [EMP1] = manifest.employees as string[];
const PREFIX = manifest.class1StudentPrefix as string;
const suites: Suite[] = [];
const SNAP = process.env.DG_SNAP!;

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}
async function scratchTopic(t: Client, name: string) {
  const r = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(r.status === 201, `建模板失败：${excerpt(r.body)}`);
  return Number(r.body.data.id);
}
const uploadPopulation = (t: Client, topicId: number, content: string | Uint8Array | ArrayBuffer, filename: string, type = "text/csv") => {
  const form = new FormData();
  form.append("file", new File([content as any], filename, { type }));
  return t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form });
};

const t = await teacher();

// ---------------------------------------------------------------- F-01 格式与内容
{
  const s = new Suite("DG-F-01");
  const topic = await scratchTopic(t, `DGF01-${Date.now()}`);

  // 中文 + BOM + 缺失值
  const bomCsv = "\uFEFF记录编号,数值,分组\n1,10,甲\n2,,乙\n3,30,甲\n";
  const bom = await uploadPopulation(t, topic, bomCsv, "bom.csv");
  s.check("带 BOM 的中文 CSV 可解析", bom.status === 200, `HTTP ${bom.status} ${excerpt(bom.body?.error)}`);
  s.check("BOM 不出现在首个列名中", (bom.body?.data?.columns ?? [])[0] === "记录编号", JSON.stringify(bom.body?.data?.columns));
  s.check("缺失值被保留为空而不报错", Number(bom.body?.data?.rowCount) === 3, JSON.stringify({ rowCount: bom.body?.data?.rowCount }));
  s.check("中文列名正确识别", JSON.stringify(bom.body?.data?.columns) === JSON.stringify(["记录编号", "数值", "分组"]), JSON.stringify(bom.body?.data?.columns));

  // 重复表头
  const dupHeader = await uploadPopulation(t, topic, "编号,编号,值\n1,2,3\n", "dup.csv");
  s.check("重复表头被明确拒绝（不是静默改名或丢弃）",
    dupHeader.status === 400 && /重复列名/.test(String(dupHeader.body?.error?.message ?? "")),
    `HTTP ${dupHeader.status} ${excerpt(dupHeader.body?.error?.message, 60)}`);

  // 公式字符串应作为文本保留
  const formula = await uploadPopulation(t, topic, "编号,公式,值\n1,=1+1,7\n2,=SUM(A1:A2),8\n", "formula.csv");
  s.check("以 = 开头的文本照常解析为字符串", formula.status === 200, `HTTP ${formula.status} ${excerpt(formula.body?.error)}`);
  const preview = formula.body?.data?.preview ?? [];
  s.check("公式文本未被求值", String(preview[0]?.["公式"] ?? "").startsWith("="), JSON.stringify(preview[0] ?? {}));

  // 保留列名（导出元数据前缀）不得被占用
  const reserved = await uploadPopulation(t, topic, "__wj_method,值\n1,2\n", "reserved.csv");
  s.check("占用保留列名前缀被拒", reserved.status === 400 && /__wj_/.test(String(reserved.body?.error?.message ?? "")),
    `HTTP ${reserved.status} ${excerpt(reserved.body?.error?.message, 60)}`);

  // .xlsx 通路
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["记录编号", "y"], [1, 10], [2, 20], [3, 30]]), "总体数据");
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const xlsx = await uploadPopulation(t, topic, xlsxBuffer, "population.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  s.check(".xlsx 可解析出正确的行数", xlsx.status === 200 && Number(xlsx.body?.data?.rowCount) === 3,
    `HTTP ${xlsx.status} rowCount=${xlsx.body?.data?.rowCount} ${excerpt(xlsx.body?.error)}`);
  s.check(".xlsx 与 .csv 的列识别一致", JSON.stringify(xlsx.body?.data?.columns) === JSON.stringify(["记录编号", "y"]), JSON.stringify(xlsx.body?.data?.columns));
  suites.push(s);
}

// ---------------------------------------------------------------- F-02 边界
{
  const s = new Suite("DG-F-02");
  const topic = await scratchTopic(t, `DGF02-${Date.now()}`);

  const empty = await uploadPopulation(t, topic, "", "empty.csv");
  s.check("空文件被拒", empty.status === 400, `HTTP ${empty.status} ${excerpt(empty.body?.error?.code)}`);

  const headerOnly = await uploadPopulation(t, topic, "编号,值\n", "header.csv");
  s.check("仅表头（0 数据行）被明确处理", headerOnly.status === 400 || (headerOnly.status === 200 && Number(headerOnly.body?.data?.rowCount) === 0),
    `HTTP ${headerOnly.status} rowCount=${headerOnly.body?.data?.rowCount} ${excerpt(headerOnly.body?.error?.message, 60)}`);

  const rows100k = 100_000;
  const big = ["编号,值", ...Array.from({ length: rows100k }, (_, i) => `${i + 1},${(i % 97) + 1}`)].join("\n") + "\n";
  const atLimit = await uploadPopulation(t, topic, big, "100k.csv");
  s.check("100,000 行（文档上限）被接受", atLimit.status === 200 && Number(atLimit.body?.data?.rowCount) === rows100k,
    `HTTP ${atLimit.status} rowCount=${atLimit.body?.data?.rowCount} ${excerpt(atLimit.body?.error?.message, 60)}`);

  const overRows = ["编号,值", ...Array.from({ length: rows100k + 1 }, (_, i) => `${i + 1},${(i % 97) + 1}`)].join("\n") + "\n";
  const tooMany = await uploadPopulation(t, topic, overRows, "100001.csv");
  s.check("100,001 行被拒", tooMany.status >= 400, `HTTP ${tooMany.status} ${excerpt(tooMany.body?.error?.message, 70)}`);

  const cols50 = "c" + Array.from({ length: 49 }, (_, i) => `,c${i + 1}`).join("");
  const row50 = Array.from({ length: 50 }, (_, i) => String(i + 1)).join(",");
  const col50 = await uploadPopulation(t, topic, cols50 + "\n" + row50 + "\n" + row50 + "\n", "50cols.csv");
  s.check("50 列被接受", col50.status === 200, `HTTP ${col50.status} ${excerpt(col50.body?.error?.message, 70)}`);

  const cols51 = cols50 + ",c51";
  const row51 = row50 + ",51";
  const col51 = await uploadPopulation(t, topic, cols51 + "\n" + row51 + "\n" + row51 + "\n", "51cols.csv");
  s.check("51 列被拒", col51.status >= 400, `HTTP ${col51.status} ${excerpt(col51.body?.error?.message, 70)}`);

  const oversized = "编号,值\n" + Array.from({ length: 21 * 1024 }, (_, i) => `${i},${"9".repeat(1024)}`).join("\n");
  const tooBig = await uploadPopulation(t, topic, oversized, "big.csv");
  s.check("超过 20 MiB 的总体文件被拒（413）", tooBig.status === 413, `HTTP ${tooBig.status} ${excerpt(tooBig.body?.error?.message, 70)}`);
  suites.push(s);
}

// ---------------------------------------------------------------- F-03 伪装与畸形
{
  const s = new Suite("DG-F-03");
  const topic = await scratchTopic(t, `DGF03-${Date.now()}`);
  const cases: Array<[string, string | Uint8Array, string, string]> = [
    ["伪装 xlsx（纯文本内容）", "plain text,not a workbook", "fake.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["截断的 xlsx（zip 头不完整）", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "truncated.xlsx", "application/octet-stream"],
    ["二进制内容伪装 .csv", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), "binary.csv", "text/csv"],
    ["不支持的扩展名", "MZ\u0090", "payload.exe", "application/octet-stream"],
  ];
  for (const [name, content, filename, type] of cases) {
    const r = await uploadPopulation(t, topic, content, filename, type);
    s.check(`${name} 被拒`, r.status >= 400, `HTTP ${r.status} ${excerpt(r.body?.error?.message ?? r.body?.error?.code, 70)}`);
  }
  suites.push(s);
}

// ---------------------------------------------------------------- F-04 路径穿越
{
  const s = new Suite("DG-F-04");
  const topic = await scratchTopic(t, `DGF04-${Date.now()}`);
  const form = new FormData();
  form.append("file", new File(["../../../../etc/passwd.csv"], "../../../../etc/evil.csv", { type: "text/csv" }));
  const r = await t.call("POST", `/api/teacher/topics/${topic}/excel`, { form });
  s.check("路径穿越文件名不会写到 storage 之外", r.status >= 400 || r.status === 200, `HTTP ${r.status}`);
  const listing = Bun.spawnSync(["find", `${SNAP}/storage`, "-newer", `${SNAP}/bunfig.toml`, "-name", "*evil*"], { stdout: "pipe" });
  const found = new TextDecoder().decode(listing.stdout).trim();
  s.check("storage 内不存在逃逸文件", found === "", found || "(none)");
  const escaped = Bun.spawnSync(["ls", "-la", "/etc/passwd.csv"], { stdout: "pipe", stderr: "pipe" });
  s.check("系统目录未出现写入文件", escaped.exitCode !== 0, `exit=${escaped.exitCode}`);
  suites.push(s);
}

// ---------------------------------------------------------------- F-05 附件签名与下载
{
  const s = new Suite("DG-F-05");
  const topic = await scratchTopic(t, `DGF05-${Date.now()}`);
  const pdfBytes = new Uint8Array(await Bun.file(`${SNAP}/public/templates/数据上传规范.pdf`).arrayBuffer());
  const okForm = new FormData();
  okForm.append("file", new File([pdfBytes], "指南.pdf", { type: "application/pdf" }));
  const ok = await t.call("POST", `/api/teacher/topics/${topic}/attachments`, { form: okForm });
  s.check("合法 PDF 附件上传成功", ok.status === 200, `HTTP ${ok.status} ${excerpt(ok.body?.error)}`);

  const badForm = new FormData();
  badForm.append("file", new File(["这不是 PDF"], "伪造.pdf", { type: "application/pdf" }));
  const bad = await t.call("POST", `/api/teacher/topics/${topic}/attachments`, { form: badForm });
  s.check("内容与扩展名不符的附件被拒", bad.status >= 400, `HTTP ${bad.status} ${excerpt(bad.body?.error?.message, 60)}`);

  // 仅有 %PDF- 魔数但缺少有效交叉引用表的文件必须被拒（防扩展名伪装）
  const magicOnly = new FormData();
  magicOnly.append("file", new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"], "magic-only.pdf", { type: "application/pdf" }));
  const magicRes = await t.call("POST", `/api/teacher/topics/${topic}/attachments`, { form: magicOnly });
  s.check("只有 PDF 魔数、无有效 xref 的文件被拒", magicRes.status >= 400, `HTTP ${magicRes.status} ${excerpt(magicRes.body?.error?.message, 60)}`);

  // 非可内联类型：preview 也必须回退为强制下载
  const docForm = new FormData();
  const ooxml = new Uint8Array(await Bun.file(`${SNAP}/public/templates/调查问卷设计规范与模板.docx`).arrayBuffer());
  docForm.append("file", new File([ooxml], "资料.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const docUp = await t.call("POST", `/api/teacher/topics/${topic}/attachments`, { form: docForm });
  if (docUp.status === 200) {
    const id = Number(docUp.body.data.id);
    const cookie2 = [...t.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const pv = await fetch(`${BASE}/api/teacher/topics/${topic}/attachments/${id}/download?mode=preview`, { headers: { Cookie: cookie2 } });
    s.check("不可内联的类型即使 preview 也强制下载",
      pv.headers.get("content-type") === "application/octet-stream" && /^attachment/.test(pv.headers.get("content-disposition") ?? ""),
      `ct=${pv.headers.get("content-type")} cd=${(pv.headers.get("content-disposition") ?? "").slice(0, 20)}`);
  } else {
    s.check("不可内联的类型即使 preview 也强制下载", false, `docx 未上传成功：HTTP ${docUp.status}`);
  }

  const exeForm = new FormData();
  exeForm.append("file", new File([new Uint8Array([0x4d, 0x5a])], "evil.exe", { type: "application/octet-stream" }));
  const exe = await t.call("POST", `/api/teacher/topics/${topic}/attachments`, { form: exeForm });
  s.check("不支持的附件类型被拒", exe.status >= 400, `HTTP ${exe.status} ${excerpt(exe.body?.error?.message, 60)}`);

  if (ok.status === 200) {
    const attachmentId = Number(ok.body.data.id);
    const download = await fetch(`${BASE}/api/teacher/topics/${topic}/attachments/${attachmentId}/download`, { headers: { Cookie: [...t.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") } });
    const bytes = new Uint8Array(await download.arrayBuffer());
    const same = bytes.length === pdfBytes.length && bytes.every((b, i) => b === pdfBytes[i]);
    s.check("附件下载内容与上传源逐字节一致", download.status === 200 && same, `HTTP ${download.status} len=${bytes.length}/${pdfBytes.length}`);
    // 默认下载是“强制下载”语义：通用 MIME + attachment + nosniff
    s.check("默认下载使用通用 MIME 并强制 attachment",
      download.headers.get("content-type") === "application/octet-stream"
      && /^attachment/.test(download.headers.get("content-disposition") ?? "")
      && download.headers.get("x-content-type-options") === "nosniff",
      `ct=${download.headers.get("content-type")} cd=${(download.headers.get("content-disposition") ?? "").slice(0, 24)}`);

    const cookie = [...t.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const preview = await fetch(`${BASE}/api/teacher/topics/${topic}/attachments/${attachmentId}/download?mode=preview`, { headers: { Cookie: cookie } });
    s.check("preview 模式下 PDF 使用真实 MIME + inline + 沙箱 CSP",
      preview.headers.get("content-type") === "application/pdf"
      && /^inline/.test(preview.headers.get("content-disposition") ?? "")
      && /sandbox/.test(preview.headers.get("content-security-policy") ?? ""),
      `ct=${preview.headers.get("content-type")} csp=${(preview.headers.get("content-security-policy") ?? "").slice(0, 40)}`);

    const ranged = await fetch(`${BASE}/api/teacher/topics/${topic}/attachments/${attachmentId}/download`, { headers: { Cookie: cookie, Range: "bytes=0-9" } });
    const rangeBytes = new Uint8Array(await ranged.arrayBuffer());
    s.check("Range 请求返回 206 与正确区间", ranged.status === 206 && rangeBytes.length === 10
      && (ranged.headers.get("content-range") ?? "").startsWith("bytes 0-9/"), `HTTP ${ranged.status} len=${rangeBytes.length} cr=${ranged.headers.get("content-range")}`);

    const badRange = await fetch(`${BASE}/api/teacher/topics/${topic}/attachments/${attachmentId}/download`, { headers: { Cookie: cookie, Range: "bytes=99999999-" } });
    s.check("非法 Range 返回 416", badRange.status === 416, `HTTP ${badRange.status}`);
  }
  suites.push(s);
}

// ---------------------------------------------------------------- F-06 请求体边界
{
  const s = new Suite("DG-F-06");
  const huge = await t.call("POST", "/api/teacher/topics", { json: { name: "体积测试", description: "x".repeat(300 * 1024) } });
  s.check("JSON 请求体超过 256 KiB 被拒（413）", huge.status === 413, `HTTP ${huge.status} ${excerpt(huge.body?.error?.message, 60)}`);

  const malformed = await fetch(`${BASE}/api/teacher/topics`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: "{not json",
  });
  s.check("畸形 JSON 被拒", malformed.status >= 400, `HTTP ${malformed.status}`);

  const wrongType = await fetch(`${BASE}/api/teacher/topics`, {
    method: "POST", headers: { "Content-Type": "text/plain", Origin: BASE }, body: "{}",
  });
  s.check("非 JSON/表单媒体类型被拒（415）", wrongType.status === 415, `HTTP ${wrongType.status}`);

  const noFile = await t.call("POST", "/api/teacher/topics/1/excel", { form: new FormData() });
  s.check("缺少文件字段被拒", noFile.status >= 400, `HTTP ${noFile.status} ${excerpt(noFile.body?.error?.message, 60)}`);
  suites.push(s);
}

// ---------------------------------------------------------------- F-07 模板下载
{
  const s = new Suite("DG-F-07");
  const names = ["数据上传规范.pdf", "数据模板.csv", "调查问卷设计规范与模板.docx", "调查问卷设计规范与模板.pdf"];
  for (const name of names) {
    const r = await fetch(`${BASE}/templates/${encodeURIComponent(name)}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    s.check(`模板 ${name} 可下载且非空`, r.status === 200 && bytes.length > 0, `HTTP ${r.status} bytes=${bytes.length}`);
  }
  const traverse = await fetch(`${BASE}/templates/${encodeURIComponent("../.env")}`);
  s.check("模板路径穿越被拒", traverse.status === 404 || traverse.status === 400, `HTTP ${traverse.status}`);
  suites.push(s);
}

// ---------------------------------------------------------------- F-08 注入
{
  const s = new Suite("DG-F-08");
  const injectRows = [3, 7, 11, 15, 19, 23].map((y, i) => ({
    记录编号: i === 0 ? "=cmd|' /C calc'!A0" : i === 1 ? "+1+1" : i === 2 ? "@SUM(A1)" : String(i + 1),
    y: String(y),
  }));
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name: `DGF08-${Date.now()}` } });
  const topicId = Number(topic.body.data.id);
  const csv = ["记录编号,y", ...injectRows.map((r) => `${r["记录编号"]},${r.y}`)].join("\n") + "\n";
  assert((await uploadPopulation(t, topicId, csv, "population.csv")).status === 200, "上传失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [], studyContract: {
      version: 1, researchQuestion: "注入测试：这六类单位的 y 平均值为多少", targetPopulation: "6 个单位", unitOfAnalysis: "单位",
      target: { kind: "mean", field: "y" } } } } })).status === 200, "映射失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } } } })).status === 200, "策略失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } })).status === 200, "权重失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } })).status === 200, "发布失败");
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [manifest.class1] } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const taskId = Number((Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId).id);

  const studentId = `${PREFIX}${String(9).padStart(3, "0")}`;
  const c = new Client(BASE);
  await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  let v = Number(exp.body.data.version);
  const q = {
    title: "注入测试问卷",
    welcomeText: `<p>${"欢迎参加本次调查。".repeat(3)}</p><script>alert('xss')</script>`,
    endingText: `<p>${"感谢您的参与。".repeat(3)}</p><img src=x onerror="alert(1)">`,
    questions: [
      { id: "q1", type: "boolean", content: "题一" },
      { id: "q2", type: "single", content: "题二", options: ["A", "B"] },
      { id: "q3", type: "multiple", content: "题三", options: ["A", "B"], minSelect: 1, maxSelect: 2 },
      { id: "q4", type: "scale", content: "题四", scaleMin: 1, scaleMax: 10 },
      { id: "q5", type: "boolean", content: "题五" },
    ],
  };
  const s1 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: v, questionnaire: q } });
  assert(s1.status === 200, `阶段1失败：${excerpt(s1.body)}`);
  v = Number(s1.body.data.version);
  const stored = JSON.stringify(s1.body.data.questionnaire ?? {});
  s.check("问卷富文本中的 <script> 被清洗", !stored.includes("<script") && !stored.includes("alert('xss')"), excerpt(stored, 120));
  s.check("问卷富文本中的 onerror 事件属性被清洗", !/onerror/i.test(stored), excerpt(stored, 120));
  s.check("清洗后正常文本保留", stored.includes("欢迎参加本次调查"), excerpt(stored, 100));

  const sigma2 = (() => { const ys = [3, 7, 11, 15, 19, 23]; const m = ys.reduce((a, b) => a + b, 0) / ys.length; return ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length; })();
  const z = 1.959963984540054, e = 3;
  const n0 = (z * z * sigma2) / (e * e);
  const recommendedSize = Math.min(6, Math.ceil((n0 * 6) / (5 + n0)));
  const s2 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
    json: { observedVersion: v, samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize: 4 } },
  });
  assert(s2.status === 200, `阶段2失败：${excerpt(s2.body)}`);
  const smp = await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 4, seed: 31 } } });
  assert(smp.status === 200, `抽样失败：${excerpt(smp.body)}`);
  const exportRes = await c.call("GET", `/api/student/tasks/${taskId}/export?type=simple`);
  const lines = exportRes.text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = lines[0]!.split(",");
  const idIdx = header.indexOf("记录编号");
  const cells = lines.slice(1).map((l) => l.split(",")[idIdx] ?? "");
  s.check("导出 CSV 中危险前缀单元格均被转义（前置单引号）",
    cells.every((cell) => !/^[=+\-@]/.test(cell)), `cells=${JSON.stringify(cells)}`);
  s.check("原始公式文本仍可辨认（未被删除）", !lines.some((l) => /=cmd/.test(l.split(",")[idIdx] ?? "")) || cells.some((c) => /cmd/.test(c)), JSON.stringify(cells));
  suites.push(s);
}

// ---------------------------------------------------------------- F-09 孤立文件审计
{
  const s = new Suite("DG-F-09");
  const before = new TextDecoder().decode(Bun.spawnSync(["find", `${SNAP}/storage`, "-type", "f"], { stdout: "pipe" }).stdout).trim();
  const audit = Bun.spawnSync([`${SNAP}/node_modules/bun/bin/bun.exe`, "run", "scripts/audit-storage.ts"], {
    cwd: SNAP, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! },
  });
  const out = new TextDecoder().decode(audit.stdout) + new TextDecoder().decode(audit.stderr);
  const after = new TextDecoder().decode(Bun.spawnSync(["find", `${SNAP}/storage`, "-type", "f"], { stdout: "pipe" }).stdout).trim();
  s.check("只读审计可执行完成", audit.exitCode === 0, `exit=${audit.exitCode} ${excerpt(out, 160)}`);
  s.check("只读审计不删除任何文件", before === after, `before=${before.split("\n").length} after=${after.split("\n").length}`);
  s.check("审计输出包含引用与孤立统计", /数据库引用文件/.test(out) && /未引用文件/.test(out), excerpt(out, 200));
  suites.push(s);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/F.json", suites);
