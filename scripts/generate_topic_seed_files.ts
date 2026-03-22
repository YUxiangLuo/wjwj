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

function round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Seeded PRNG helpers — produce deterministic, realistic distributions
// ---------------------------------------------------------------------------

/** Mulberry32 — fast 32-bit seeded PRNG returning values in [0, 1). */
function createRng(seed: number) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Approximate normal via Box-Muller, clamped to [lo, hi]. */
function normalRandom(rng: () => number, mean: number, stdDev: number, lo = -Infinity, hi = Infinity): number {
    const u1 = rng() || 1e-10;
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.min(hi, Math.max(lo, mean + z * stdDev));
}

/** Pick from weighted categories. */
function weightedPick<T>(rng: () => number, items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i]!;
        if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
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

    // ---- Per-stratum distribution configs ----
    // Each maps a stratum value to { mean, stdDev } for a numeric field.
    // This creates heterogeneous within-stratum variances — the key
    // ingredient for Neyman allocation to differ from proportional.

    const diningByAge: Record<string, { mean: number; stdDev: number }> = {
        "18-29": { mean: 360, stdDev: 180 },   // young: moderate spend, high variance
        "30-44": { mean: 680, stdDev: 280 },   // peak earners: high spend, very high variance
        "45-59": { mean: 500, stdDev: 120 },   // mid-age: moderate spend, moderate variance
        "60+":   { mean: 280, stdDev: 55 },    // retired: low spend, low variance
    };
    const satisfactionByAge: Record<string, { mean: number; stdDev: number }> = {
        "18-29": { mean: 2.8, stdDev: 1.2 },
        "30-44": { mean: 3.5, stdDev: 0.9 },
        "45-59": { mean: 4.1, stdDev: 0.6 },
        "60+":   { mean: 3.8, stdDev: 1.0 },
    };

    const incomeByEdu: Record<string, { mean: number; stdDev: number }> = {
        "高中及以下": { mean: 4200, stdDev: 800 },
        "大专":      { mean: 5800, stdDev: 1200 },
        "本科":      { mean: 8500, stdDev: 2800 },
        "硕士":      { mean: 12500, stdDev: 4500 },
        "博士":      { mean: 16000, stdDev: 6000 },
    };

    const studyByVip: Record<string, { mean: number; stdDev: number }> = {
        "普通": { mean: 6, stdDev: 4 },
        "银卡": { mean: 14, stdDev: 5 },
        "金卡": { mean: 22, stdDev: 4 },
        "钻石": { mean: 32, stdDev: 3 },
    };
    const completionByVip: Record<string, { mean: number; stdDev: number }> = {
        "普通": { mean: 40, stdDev: 22 },
        "银卡": { mean: 62, stdDev: 16 },
        "金卡": { mean: 78, stdDev: 10 },
        "钻石": { mean: 92, stdDev: 5 },
    };

    const bmiByAge: Record<string, { mean: number; stdDev: number }> = {
        "20-29": { mean: 21.5, stdDev: 2.0 },
        "30-39": { mean: 23.8, stdDev: 3.2 },
        "40-49": { mean: 25.4, stdDev: 3.8 },
        "50-60": { mean: 26.2, stdDev: 4.5 },
    };
    const exerciseByAge: Record<string, { mean: number; stdDev: number }> = {
        "20-29": { mean: 5.5, stdDev: 3.5 },
        "30-39": { mean: 3.2, stdDev: 2.5 },
        "40-49": { mean: 2.8, stdDev: 2.0 },
        "50-60": { mean: 4.0, stdDev: 2.8 },
    };

    return [
        // ----------------------------------------------------------------
        // 1. Consumer behavior analysis (10 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "consumer_population.xlsx",
            rows: 10000,
            sheetName: "Consumers",
            buildRow: (() => {
                const rng = createRng(42);
                return (index: number) => {
                    const gender = weightedPick(rng, ["男", "女"], [48, 52]);
                    const ageGroup = weightedPick(rng, ["18-24", "25-34", "35-44", "45-55"], [22, 38, 28, 12]);
                    const education = weightedPick(rng, educations, [12, 22, 40, 18, 8]);
                    const eduDist = incomeByEdu[education]!;
                    const income = round(normalRandom(rng, eduDist.mean, eduDist.stdDev, 1500, 50000), 0);
                    const expenseRate = normalRandom(rng, 0.45, 0.12, 0.15, 0.85);
                    return {
                        id: index + 1,
                        gender,
                        age_group: ageGroup,
                        education,
                        income,
                        monthly_expense: round(income * expenseRate, 0),
                        city: weightedPick(rng, cities, [18, 17, 14, 13, 12, 10, 9, 7]),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 2. Student shopping survey (5 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "student_shopping.xlsx",
            rows: 5000,
            sheetName: "Students",
            buildRow: (() => {
                const rng = createRng(123);
                const spendingByGrade: Record<string, { mean: number; stdDev: number }> = {
                    "大一": { mean: 650, stdDev: 180 },
                    "大二": { mean: 820, stdDev: 260 },
                    "大三": { mean: 950, stdDev: 350 },
                    "大四": { mean: 1100, stdDev: 420 },
                };
                return (index: number) => {
                    const grade = weightedPick(rng, grades, [30, 28, 24, 18]);
                    const dist = spendingByGrade[grade]!;
                    const spending = round(normalRandom(rng, dist.mean, dist.stdDev, 100, 5000), 0);
                    return {
                        student_no: `2024${String(index + 1).padStart(6, "0")}`,
                        gender: weightedPick(rng, ["男", "女"], [44, 56]),
                        grade,
                        monthly_spending: spending,
                        order_count: Math.max(0, round(normalRandom(rng, spending / 120, 3, 0, 40), 0)),
                        major: weightedPick(rng, majors, [12, 18, 22, 20, 16, 12]),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 3. Community dining / market research (8 000 rows)
        //    Key topic: must show clear stratum heterogeneity.
        // ----------------------------------------------------------------
        {
            fileName: "community_dining.xlsx",
            rows: 8000,
            sheetName: "CommunityDining",
            buildRow: (() => {
                const rng = createRng(314);
                const ageGroups = ["18-29", "30-44", "45-59", "60+"] as const;
                return (index: number) => {
                    const ageGroup = weightedPick(rng, [...ageGroups], [28, 36, 23, 13]);
                    const householdSize = weightedPick(rng, [1, 2, 3, 4, 5, 6], [16, 30, 26, 15, 8, 5]);
                    const dd = diningByAge[ageGroup]!;
                    const sizeBoost = (householdSize - 1) * 45;
                    const expense = round(normalRandom(rng, dd.mean + sizeBoost, dd.stdDev, 50, 2500), 0);
                    const sd = satisfactionByAge[ageGroup]!;
                    const satisfaction = Math.min(5, Math.max(1, round(normalRandom(rng, sd.mean, sd.stdDev), 0)));
                    return {
                        resident_id: `R${String(index + 1).padStart(6, "0")}`,
                        age_group: ageGroup,
                        household_size: householdSize,
                        dining_expense: expense,
                        satisfaction,
                        district: weightedPick(rng, districts, [22, 14, 18, 12, 20, 14]),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 4. Education platform (15 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "education_platform.xlsx",
            rows: 15000,
            sheetName: "EducationPlatform",
            buildRow: (() => {
                const rng = createRng(271);
                return (index: number) => {
                    const vip = weightedPick(rng, vipLevels, [45, 28, 18, 9]);
                    const sd = studyByVip[vip]!;
                    const cd = completionByVip[vip]!;
                    const studyHours = round(normalRandom(rng, sd.mean, sd.stdDev, 0, 60), 1);
                    const completionRate = round(normalRandom(rng, cd.mean, cd.stdDev, 0, 100), 1);
                    const quizBase = completionRate * 0.6 + normalRandom(rng, 20, 8, 0, 40);
                    return {
                        user_id: `U${String(index + 1).padStart(7, "0")}`,
                        vip_level: vip,
                        region: weightedPick(rng, regions, [25, 18, 20, 12, 10, 8, 7]),
                        study_hours: studyHours,
                        completion_rate: completionRate,
                        quiz_score: Math.min(100, Math.max(0, round(quizBase, 0))),
                        register_channel: weightedPick(rng, registerChannels, [30, 25, 20, 15, 10]),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 5. Social media (20 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "social_media.xlsx",
            rows: 20000,
            sheetName: "SocialMedia",
            buildRow: (() => {
                const rng = createRng(577);
                const followersByPlatform: Record<string, { mean: number; stdDev: number }> = {
                    "微博":   { mean: 8000, stdDev: 25000 },
                    "抖音":   { mean: 15000, stdDev: 50000 },
                    "小红书": { mean: 3500, stdDev: 8000 },
                    "B站":    { mean: 5000, stdDev: 18000 },
                    "快手":   { mean: 10000, stdDev: 35000 },
                };
                return (index: number) => {
                    const platform = weightedPick(rng, platforms, [20, 30, 22, 15, 13]);
                    const verified = weightedPick(rng, ["是", "否"], [12, 88]);
                    const fd = followersByPlatform[platform]!;
                    const verifiedMult = verified === "是" ? 5 : 1;
                    const followers = Math.max(10, round(normalRandom(rng, fd.mean * verifiedMult, fd.stdDev * verifiedMult, 10, 5000000), 0));
                    const engagementBase = 8 - Math.log10(followers + 1) * 1.2;
                    return {
                        account_id: `A${String(index + 1).padStart(8, "0")}`,
                        platform,
                        verified,
                        followers,
                        engagement_rate: round(Math.max(0.1, normalRandom(rng, engagementBase, 1.5, 0.1, 30)), 2),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 6. Health & exercise (12 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "health_exercise.xlsx",
            rows: 12000,
            sheetName: "HealthExercise",
            buildRow: (() => {
                const rng = createRng(628);
                const healthAgeGroups = ["20-29", "30-39", "40-49", "50-60"] as const;
                const diseaseWeightsByAge: Record<string, number[]> = {
                    "20-29": [85, 3, 2, 1, 9],
                    "30-39": [65, 10, 8, 5, 12],
                    "40-49": [42, 18, 15, 12, 13],
                    "50-60": [22, 25, 18, 20, 15],
                };
                return (index: number) => {
                    const gender = weightedPick(rng, ["男", "女"], [47, 53]);
                    const ageGroup = weightedPick(rng, [...healthAgeGroups], [32, 28, 24, 16]);
                    const bd = bmiByAge[ageGroup]!;
                    const genderOffset = gender === "男" ? 0.8 : -0.3;
                    const ed = exerciseByAge[ageGroup]!;
                    return {
                        id: index + 1,
                        gender,
                        age_group: ageGroup,
                        bmi: round(normalRandom(rng, bd.mean + genderOffset, bd.stdDev, 15, 42), 1),
                        exercise_hours_per_week: round(normalRandom(rng, ed.mean, ed.stdDev, 0, 25), 1),
                        sleep_hours: round(normalRandom(rng, 7.2, 1.0, 3, 12), 1),
                        chronic_disease: weightedPick(rng, diseases, diseaseWeightsByAge[ageGroup]!),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 7. Archived topic (6 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "archived.xlsx",
            rows: 6000,
            sheetName: "ArchivedTopic",
            buildRow: (() => {
                const rng = createRng(999);
                return (index: number) => {
                    const gender = weightedPick(rng, ["男", "女"], [50, 50]);
                    const baseMean = gender === "男" ? 7200 : 6400;
                    return {
                        id: index + 1,
                        gender,
                        income: round(normalRandom(rng, baseMean, 2800, 1500, 30000), 0),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 8. 2023 consumer (9 000 rows)
        // ----------------------------------------------------------------
        {
            fileName: "2023_consumer.xlsx",
            rows: 9000,
            sheetName: "Consumer2023",
            buildRow: (() => {
                const rng = createRng(2023);
                const incomeByTier: Record<string, { mean: number; stdDev: number }> = {
                    "一线":   { mean: 14000, stdDev: 6000 },
                    "新一线": { mean: 10000, stdDev: 4000 },
                    "二线":   { mean: 7500, stdDev: 2500 },
                    "三线":   { mean: 5500, stdDev: 1500 },
                };
                return (index: number) => {
                    const tier = weightedPick(rng, cityTiers, [18, 25, 32, 25]);
                    const td = incomeByTier[tier]!;
                    const income = round(normalRandom(rng, td.mean, td.stdDev, 2000, 60000), 0);
                    const spendRate = normalRandom(rng, 0.42, 0.14, 0.1, 0.8);
                    return {
                        id: index + 1,
                        gender: weightedPick(rng, ["男", "女"], [47, 53]),
                        city_tier: tier,
                        age: Math.min(55, Math.max(18, round(normalRandom(rng, 32, 9), 0))),
                        income,
                        spending: round(income * spendRate, 0),
                    };
                };
            })(),
        },
        // ----------------------------------------------------------------
        // 9. Field metadata example (8 rows — unchanged)
        // ----------------------------------------------------------------
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
