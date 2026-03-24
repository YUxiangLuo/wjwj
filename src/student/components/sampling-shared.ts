export const FIELD_LABELS: Record<string, string> = {
    gender: "性别",
    education: "学历",
    age: "年龄",
    age_group: "年龄段",
    income: "收入水平",
    city: "城市",
    city_tier: "城市等级",
    monthly_expense: "月支出",
    spending: "消费支出",
    salary: "薪资",
    price: "价格",
    quantity: "数量",
};

export function parseSeed(seedText: string): { seed: number | undefined; error: string | null } {
    const trimmed = seedText.trim();
    if (!trimmed) return { seed: undefined, error: null };
    if (!/^-?\d+$/.test(trimmed)) return { seed: undefined, error: "随机种子需为整数" };
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed)) return { seed: undefined, error: "随机种子值超出安全整数范围" };
    return { seed: parsed, error: null };
}
