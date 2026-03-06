import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

const OUTPUT_DIR = path.join(process.cwd(), "storage", "uploads", "topics");
const CJK_FONT_PATH = resolveCjkFontPath();

type JsonRow = Record<string, string | number | boolean>;
type WorkbookSpec = {
    fileName: string;
    rows: number;
    sheetName: string;
    buildRow: (index: number) => JsonRow;
};
type PdfSpec = {
    fileName: string;
    title: string;
    subtitle?: string;
    sections: { heading: string; lines: string[] }[];
};

function resolveCjkFontPath() {
    const result = spawnSync("fc-match", ["-f", "%{file}\n", "Noto Sans CJK SC"], {
        encoding: "utf8",
    });
    const fontPath = result.status === 0 ? result.stdout.trim() : "";
    return fontPath || null;
}

function cycle<T>(values: T[], index: number, step = 1, offset = 0) {
    return values[(offset + index * step) % values.length]!;
}

function round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

async function ensureOutputDir() {
    await mkdir(OUTPUT_DIR, { recursive: true });
}

function writeWorkbook(spec: WorkbookSpec) {
    const rows: JsonRow[] = [];
    for (let index = 0; index < spec.rows; index += 1) {
        rows.push(spec.buildRow(index));
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, spec.sheetName);
    XLSX.writeFile(workbook, path.join(OUTPUT_DIR, spec.fileName));
}

async function writePdf(spec: PdfSpec) {
    const outputPath = path.join(OUTPUT_DIR, spec.fileName);

    await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 48 });
        const stream = createWriteStream(outputPath);

        doc.pipe(stream);

        try {
            if (CJK_FONT_PATH) {
                doc.font(CJK_FONT_PATH);
            }
        } catch {
            // Fall back to the built-in font if the host font cannot be loaded.
        }

        doc.fontSize(22).fillColor("#0f172a").text(spec.title);
        if (spec.subtitle) {
            doc.moveDown(0.4);
            doc.fontSize(11).fillColor("#475569").text(spec.subtitle);
        }

        for (const section of spec.sections) {
            doc.moveDown(1);
            doc.fontSize(14).fillColor("#111827").text(section.heading);
            doc.moveDown(0.3);
            doc.fontSize(11).fillColor("#374151");
            for (const line of section.lines) {
                doc.text(`• ${line}`, {
                    lineGap: 4,
                });
            }
        }

        doc.end();

        stream.on("finish", () => resolve());
        stream.on("error", (error) => reject(error));
        doc.on("error", (error) => reject(error));
    });
}

function escapeXml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function buildDocxParagraphs(lines: string[]) {
    return lines
        .map(
            (line) =>
                `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
        )
        .join("");
}

async function runZip(tempDir: string, outputPath: string) {
    await new Promise<void>((resolve, reject) => {
        const child = spawn("zip", ["-q", "-r", outputPath, "."], {
            cwd: tempDir,
            stdio: "ignore",
        });

        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`zip exited with code ${code ?? -1}`));
        });
    });
}

async function writeDocx(fileName: string, lines: string[]) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "topic-docx-"));
    const relsDir = path.join(tempDir, "_rels");
    const wordDir = path.join(tempDir, "word");
    const outputPath = path.join(OUTPUT_DIR, fileName);

    try {
        await mkdir(relsDir, { recursive: true });
        await mkdir(wordDir, { recursive: true });

        await writeFile(
            path.join(tempDir, "[Content_Types].xml"),
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
        );
        await writeFile(
            path.join(relsDir, ".rels"),
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
        );
        await writeFile(
            path.join(wordDir, "document.xml"),
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildDocxParagraphs(lines)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
        );

        await runZip(tempDir, outputPath);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

function createChunk(type: string, data: Buffer) {
    const typeBuffer = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuffer, data]);
    const crcValue = crc32(crcInput);

    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crcValue >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(input: Uint8Array) {
    let crc = 0xffffffff;

    for (const byte of input) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

async function writePng(fileName: string, width: number, height: number) {
    const raw = Buffer.alloc(height * (1 + width * 4));
    const palette = [
        [15, 23, 42],
        [30, 41, 59],
        [14, 116, 144],
        [245, 158, 11],
        [220, 38, 38],
    ] as const;

    let offset = 0;
    for (let y = 0; y < height; y += 1) {
        raw[offset++] = 0;
        for (let x = 0; x < width; x += 1) {
            const band = Math.floor((x / width) * palette.length);
            const [baseR, baseG, baseB] = palette[(band + Math.floor(y / 72)) % palette.length]!;
            const highlight = (x + y) % 29 < 8 ? 18 : 0;
            const divider = y % 72 < 3 ? 35 : 0;

            raw[offset++] = Math.min(255, baseR + highlight + divider);
            raw[offset++] = Math.min(255, baseG + highlight + divider);
            raw[offset++] = Math.min(255, baseB + highlight + divider);
            raw[offset++] = 255;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const output = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        createChunk("IHDR", ihdr),
        createChunk("IDAT", deflateSync(raw)),
        createChunk("IEND", Buffer.alloc(0)),
    ]);

    await writeFile(path.join(OUTPUT_DIR, fileName), output);
}

function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
}

function buildWorkbooks(): WorkbookSpec[] {
    const cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "西安"];
    const ageGroups = ["18-24", "25-34", "35-44", "45-55"];
    const educations = ["高中及以下", "大专", "本科", "硕士", "博士"];
    const grades = ["大一", "大二", "大三", "大四"];
    const majors = ["统计学", "经济学", "计算机科学", "市场营销", "金融学", "心理学"];
    const districts = ["东城区", "西城区", "南城区", "北城区", "滨江区", "高新区"];
    const vipLevels = ["普通", "银卡", "金卡", "钻石"];
    const regions = ["华东", "华北", "华南", "华中", "西南", "西北", "东北"];
    const registerChannels = ["自然搜索", "社交投放", "校园推广", "邀请注册", "应用商店"];
    const platforms = ["微博", "抖音", "小红书", "B站", "快手"];
    const diseases = ["无", "高血压", "高血脂", "糖尿病", "其他慢病"];
    const cityTiers = ["一线", "新一线", "二线", "三线"];

    return [
        {
            fileName: "consumer_population.xlsx",
            rows: 10000,
            sheetName: "Consumers",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    id: i,
                    gender: cycle(["男", "女"], index, 3),
                    age_group: cycle(ageGroups, index, 5),
                    education: cycle(educations, index, 7),
                    income: 4500 + (index % 12) * 1200 + Math.floor(index / 250) * 45,
                    monthly_expense: 1800 + (index % 9) * 260 + (index % 4) * 85,
                    city: cycle(cities, index, 11),
                };
            },
        },
        {
            fileName: "student_shopping.xlsx",
            rows: 5000,
            sheetName: "Students",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    student_no: `2024${String(i).padStart(6, "0")}`,
                    gender: cycle(["男", "女"], index, 5),
                    grade: cycle(grades, index, 3),
                    monthly_spending: 480 + (index % 10) * 95 + (index % 3) * 20,
                    order_count: 2 + (index % 14),
                    major: cycle(majors, index, 7),
                };
            },
        },
        {
            fileName: "community_dining.xlsx",
            rows: 8000,
            sheetName: "CommunityDining",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    resident_id: `R${String(i).padStart(6, "0")}`,
                    age_group: cycle(["18-29", "30-44", "45-59", "60+"], index, 5),
                    household_size: 1 + (index % 6),
                    dining_expense: 320 + (index % 15) * 38 + (index % 4) * 12,
                    satisfaction: 2 + (index % 4),
                    district: cycle(districts, index, 11),
                };
            },
        },
        {
            fileName: "education_platform.xlsx",
            rows: 15000,
            sheetName: "EducationPlatform",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    user_id: `U${String(i).padStart(7, "0")}`,
                    vip_level: cycle(vipLevels, index, 7),
                    region: cycle(regions, index, 13),
                    study_hours: round(8 + (index % 18) * 1.35 + (index % 5) * 0.4, 1),
                    completion_rate: round(52 + (index % 11) * 4.3 + (index % 3) * 1.1, 1),
                    quiz_score: 58 + (index % 38),
                    register_channel: cycle(registerChannels, index, 9),
                };
            },
        },
        {
            fileName: "social_media.xlsx",
            rows: 20000,
            sheetName: "SocialMedia",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    account_id: `A${String(i).padStart(8, "0")}`,
                    platform: cycle(platforms, index, 11),
                    verified: cycle(["是", "否"], index, 3),
                    followers: 800 + index * 17 + (index % 6) * 300,
                    engagement_rate: round(1.6 + (index % 10) * 0.48 + (index % 3) * 0.12, 2),
                };
            },
        },
        {
            fileName: "health_exercise.xlsx",
            rows: 12000,
            sheetName: "HealthExercise",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    id: i,
                    gender: cycle(["男", "女"], index, 7),
                    age_group: cycle(["20-29", "30-39", "40-49", "50-60"], index, 5),
                    bmi: round(18.4 + (index % 12) * 0.72 + (index % 4) * 0.08, 1),
                    exercise_hours_per_week: round(0.8 + (index % 9) * 0.9 + (index % 3) * 0.2, 1),
                    sleep_hours: round(5.8 + (index % 7) * 0.42, 1),
                    chronic_disease: cycle(diseases, index, 9),
                };
            },
        },
        {
            fileName: "archived.xlsx",
            rows: 6000,
            sheetName: "ArchivedTopic",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    id: i,
                    gender: cycle(["男", "女"], index, 5),
                    income: 3800 + (index % 14) * 980 + Math.floor(index / 300) * 35,
                };
            },
        },
        {
            fileName: "2023_consumer.xlsx",
            rows: 9000,
            sheetName: "Consumer2023",
            buildRow: (index) => {
                const i = index + 1;
                return {
                    id: i,
                    gender: cycle(["男", "女"], index, 7),
                    city_tier: cycle(cityTiers, index, 5),
                    age: 18 + (index % 38),
                    income: 4200 + (index % 16) * 1100 + Math.floor(index / 220) * 25,
                    spending: 1500 + (index % 13) * 210 + (index % 5) * 40,
                };
            },
        },
        {
            fileName: "data_analysis_example.xlsx",
            rows: 8,
            sheetName: "FieldNotes",
            buildRow: (index) => {
                const notes = [
                    ["user_id", "identifier", "U0000001", "平台唯一用户编号"],
                    ["vip_level", "stratified", "金卡", "适合演示分层变量"],
                    ["region", "stratified", "华东", "区域层可用于配额示例"],
                    ["study_hours", "numeric", "18.6", "学习时长，单位小时"],
                    ["completion_rate", "numeric", "83.4", "课程完成率，百分比"],
                    ["quiz_score", "numeric", "91", "测验成绩，满分100"],
                    ["register_channel", "others", "校园推广", "注册来源渠道"],
                    ["note", "meta", "示例文件仅用于说明", "不参与种子课题总体抽样"],
                ] as const;
                const [field_name, category, example_value, description] = notes[index]!;
                return { field_name, category, example_value, description };
            },
        },
    ];
}

function buildPdfs(): PdfSpec[] {
    return [
        {
            fileName: "consumer_guide.pdf",
            title: "消费者行为分析实验指导书",
            subtitle: "测试附件，覆盖课题详情页下载与在线预览流程。",
            sections: [
                {
                    heading: "实验目标",
                    lines: ["掌握问卷设计原则。", "完成简单随机抽样与分层抽样。", "形成消费者行为分析报告。"],
                },
                {
                    heading: "提交要求",
                    lines: ["问卷不少于 10 题。", "报告需包含抽样方法、样本结构与结论。", "附录中列出变量说明。"],
                },
            ],
        },
        {
            fileName: "shopping_guide.pdf",
            title: "网购趋势调查实验指导书",
            subtitle: "用于测试多附件课题的 PDF 预览能力。",
            sections: [
                {
                    heading: "研究问题",
                    lines: ["大学生月均网购支出分布如何。", "不同年级订单频次是否有差异。", "专业背景是否影响消费偏好。"],
                },
                {
                    heading: "方法提示",
                    lines: ["建议先进行描述性统计。", "再尝试系统抽样并比较样本稳定性。"],
                },
            ],
        },
        {
            fileName: "shopping_refs.pdf",
            title: "参考文献汇总",
            subtitle: "测试 PDF 下载附件。",
            sections: [
                {
                    heading: "示例文献",
                    lines: [
                        "王某某. 大学生网络消费行为研究. 统计教学, 2024.",
                        "李某某. 电商平台用户画像方法综述. 数据分析评论, 2023.",
                        "Zhang, Y. Survey Sampling in Campus Commerce. Journal of Applied Statistics, 2022.",
                    ],
                },
            ],
        },
        {
            fileName: "market_guide.pdf",
            title: "市场调研方法指导手册",
            subtitle: "社区餐饮课题的占位测试文档。",
            sections: [
                {
                    heading: "流程建议",
                    lines: ["定义调研目标。", "确定抽样框与抽样单位。", "完成问卷、执行与报告。"],
                },
                {
                    heading: "质量控制",
                    lines: ["检查缺失值。", "核对样本量与层别占比。", "对极端值做备注说明。"],
                },
            ],
        },
        {
            fileName: "data_analysis_slides.pdf",
            title: "数据分析入门讲义",
            subtitle: "用于测试课题附件中的教学资料展示。",
            sections: [
                {
                    heading: "讲义目录",
                    lines: ["描述性统计。", "抽样误差。", "图表表达。", "结果解释。"],
                },
                {
                    heading: "课堂练习",
                    lines: ["计算均值、中位数与标准差。", "比较不同地区学习时长。", "解释完成率差异。"],
                },
            ],
        },
        {
            fileName: "health_guide.pdf",
            title: "健康调查实验手册",
            subtitle: "居民健康课题测试文档。",
            sections: [
                {
                    heading: "变量说明",
                    lines: ["BMI 为体质指数。", "exercise_hours_per_week 表示每周锻炼时长。", "sleep_hours 表示平均睡眠时长。"],
                },
                {
                    heading: "分析建议",
                    lines: ["比较不同年龄组 BMI 均值。", "观察慢病与运动时长的关联。"],
                },
            ],
        },
        {
            fileName: "2023_consumer_guide.pdf",
            title: "2023年消费趋势指导书",
            subtitle: "往期课题测试附件。",
            sections: [
                {
                    heading: "背景",
                    lines: ["该课题用于展示往期已完成任务。", "可用于回归测试历史附件访问权限。"],
                },
                {
                    heading: "报告要求",
                    lines: ["说明城市层级差异。", "比较年龄与消费金额关系。"],
                },
            ],
        },
    ];
}

async function writeAllFiles() {
    await ensureOutputDir();

    console.log(`Writing topic seed files into ${OUTPUT_DIR}`);

    for (const workbook of buildWorkbooks()) {
        writeWorkbook(workbook);
    }

    for (const pdf of buildPdfs()) {
        await writePdf(pdf);
    }

    await writeDocx("consumer_template.docx", [
        "调查问卷模板",
        "课题名称：消费者行为分析实验",
        "一、基本信息",
        "1. 您的性别是？",
        "2. 您的年龄段是？",
        "3. 您的月均消费金额处于什么区间？",
        "二、消费习惯",
        "4. 您更偏好的购买渠道是什么？",
        "5. 您最近三个月最常购买的商品类别是什么？",
        "6. 品牌是否会显著影响您的购买决策？",
        "三、开放问题",
        "7. 请简述您最关注的消费因素。",
    ]);

    await writePng("health_reference.png", 960, 540);

    const files = [
        ...buildWorkbooks().map((item) => item.fileName),
        ...buildPdfs().map((item) => item.fileName),
        "consumer_template.docx",
        "health_reference.png",
    ];

    console.log("");
    for (const fileName of files) {
        const info = await stat(path.join(OUTPUT_DIR, fileName));
        console.log(`${fileName.padEnd(28)} ${formatBytes(info.size)}`);
    }
}

await writeAllFiles();
