
/**
 * Generate Population CSV for Topic "Consumer Behavior Analysis"
 * Run with: bun run src/scripts/gen-csv.ts
 */

import { join } from "path";
import { write } from "bun";

const ROW_COUNT = 10000;
const OUTPUT_FILE = "consumer_population.csv";

// Helpers
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = <T>(arr: T[], weights?: number[]): T => {
    if (arr.length === 0) throw new Error("Array cannot be empty");
    if (!weights) return arr[Math.floor(Math.random() * arr.length)]!;
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < arr.length; i++) {
        if (random < weights[i]!) return arr[i]!;
        random -= weights[i]!;
    }
    return arr[arr.length - 1]!;
};

// Data Generators
const generateAge = () => {
    // Normal-ish distribution around 35
    const u = Math.random() + Math.random();
    const age = Math.floor(u * 15 + 18); // 18 ~ 48 base
    return Math.min(80, Math.max(18, age + randomInt(-5, 20))); // Add noise
};

const generateIncome = (age: number) => {
    // Income correlates often with age
    const base = 30000 + (age - 18) * 1500;
    const noise = randomInt(-10000, 20000);
    return Math.max(20000, base + noise);
};

// Main Generation
async function generate() {
    console.log(`🚀 Generating ${ROW_COUNT} rows of population data...`);

    const headers = [
        "customer_id",
        "gender",
        "age",
        "region",
        "annual_income",
        "spending_score",
        "membership_level",
        "preferred_category",
        "last_purchase_amount",
        "churn_risk"
    ];

    let csvContent = headers.join(",") + "\n";

    for (let i = 1; i <= ROW_COUNT; i++) {
        const id = `C${i.toString().padStart(5, '0')}`;
        const gender = randomChoice(["Male", "Female"], [0.48, 0.52]);
        const age = generateAge();
        const region = randomChoice(["North", "South", "East", "West"]);
        const income = generateIncome(age);
        const spendingScore = randomInt(1, 100); // 1-100 score

        let membership = "Bronze";
        if (spendingScore > 80) membership = "Platinum";
        else if (spendingScore > 50) membership = "Gold";
        else if (spendingScore > 20) membership = "Silver";

        const category = randomChoice(
            ["Electronics", "Clothing", "Home & Garden", "Beauty", "Sports"],
            [0.25, 0.35, 0.15, 0.15, 0.1]
        );

        // Correlate purchase amount with category and income (loosely)
        const baseAmount = { "Electronics": 500, "Clothing": 100, "Home & Garden": 200, "Beauty": 80, "Sports": 150 }[category] || 100;
        const purchaseAmount = Math.floor(baseAmount * (randomInt(50, 200) / 100));

        // Logic for Churn Risk
        const riskScore = (spendingScore < 30 ? 30 : 0) + (purchaseAmount < 100 ? 20 : 0);
        const churn = riskScore + randomInt(0, 50) > 60 ? "High" : (riskScore + randomInt(0, 50) > 30 ? "Medium" : "Low");

        const row = [
            id,
            gender,
            age,
            region,
            income,
            spendingScore,
            membership,
            category,
            purchaseAmount,
            churn
        ];

        csvContent += row.join(",") + "\n";
    }

    const path = join(process.cwd(), OUTPUT_FILE);
    await write(path, csvContent);

    console.log(`✅ CSV generated at: ${path}`);
    console.log("------------------------------------------");
    console.log("Sample Data:");
    console.log(csvContent.split("\n").slice(0, 5).join("\n"));
}

generate();
