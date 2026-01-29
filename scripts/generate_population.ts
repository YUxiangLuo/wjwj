import { utils, writeFile } from "xlsx";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Configuration
const POPULATION_SIZE = 10000;
const OUTPUT_DIR = "storage/uploads";
const OUTPUT_FILE = "population.xlsx";

interface Person {
  id: number;
  gender: "男" | "女";
  age: number;
  income: number;
  education: "高中及以下" | "本科" | "硕士" | "博士";
}

// Helpers
const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)]!;

async function generate() {
  console.log(`Generating population of ${POPULATION_SIZE} people...`);

  const data: Person[] = [];

  for (let i = 1; i <= POPULATION_SIZE; i++) {
    // Generate somewhat realistic data distributions
    const gender = randomChoice(["男", "女"] as const);

    // Age: Normal distribution-ish centered around 35
    let age = randomInt(18, 65);
    if (Math.random() > 0.7) age = randomInt(25, 45); // Skew towards workforce

    // Education
    let education: Person["education"] = "本科";
    const r = Math.random();
    if (r < 0.2) education = "高中及以下";
    else if (r < 0.7) education = "本科";
    else if (r < 0.95) education = "硕士";
    else education = "博士";

    // Income: Correlated with age and education
    let baseIncome = 3000;
    if (education === "本科") baseIncome += 2000;
    if (education === "硕士") baseIncome += 5000;
    if (education === "博士") baseIncome += 8000;

    baseIncome += (age - 18) * 200; // Experience bonus
    const income = baseIncome + randomInt(-2000, 5000);

    data.push({
      id: i,
      gender,
      age,
      income: Math.max(3000, income), // Min income check
      education,
    });
  }

  // Create workbook
  const worksheet = utils.json_to_sheet(data);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Population");

  // Ensure directory exists
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }

  // Write file
  const outputPath = join(process.cwd(), OUTPUT_DIR, OUTPUT_FILE);
  writeFile(workbook, outputPath);

  console.log(`✅ Generated population file at: ${outputPath}`);
}

generate().catch(console.error);
