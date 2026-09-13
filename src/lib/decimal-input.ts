/** Decimal meaning, independent of exponent formatting and insignificant trailing zeros. */
export function decimalIdentity(text: string): string {
    const [mantissa, exponent = "0"] = text.toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa!.replace(/^-/, "").split(".");
    const digits = `${whole}${fraction}`.replace(/^0+/, "");
    if (!digits) return "0";
    const coefficient = digits.replace(/0+$/, "");
    return `${text.startsWith("-") ? "-" : ""}${coefficient}e${Number(exponent) - fraction.length + digits.length - coefficient.length}`;
}

/** No locale normalization, rounding, overflow or silent underflow to zero. */
export function parseDecimalInput(text: string): { ok: true; value: number } | { ok: false; error: string } {
    if (text.length > 200 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
        return { ok: false, error: "请输入完整十进制数值（如 0.5），不使用空格、千位分隔符或带前导零的编码。" };
    }
    const value = Number(text);
    if (!Number.isFinite(value) || decimalIdentity(text) !== decimalIdentity(String(value))) {
        return { ok: false, error: "数值超出可表示范围或转换会改变有效数字，请核对输入；不会自动取整。" };
    }
    return { ok: true, value };
}

export function decimalPlaces(value: number): number {
    const identity = decimalIdentity(String(value));
    if (identity === "0") return 0;
    return Math.max(0, -Number(identity.split("e")[1]));
}
