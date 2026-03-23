import { expect, test } from "bun:test";
import {
    normalizeConfidenceLevel,
    zForConfidenceLevel,
} from "./confidence-level";

test("normalizeConfidenceLevel 仅接受 90/95/99", () => {
    expect(normalizeConfidenceLevel("95")).toBe("95");
    expect(normalizeConfidenceLevel("80")).toBe("95");
    expect(normalizeConfidenceLevel("")).toBe("95");
});

test("zForConfidenceLevel 非法值回退到 95% 的 Z", () => {
    expect(zForConfidenceLevel("95")).toBe(1.96);
    expect(zForConfidenceLevel("80")).toBe(1.96);
});
