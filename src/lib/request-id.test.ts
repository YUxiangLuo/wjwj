import { afterEach, expect, mock, test } from "bun:test";
import { createRequestId } from "./request-id";

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
afterEach(() => Object.defineProperty(globalThis, "crypto", originalCrypto));

test("uses the native UUID generator when available", () => {
    const randomUUID = mock(() => "12345678-1234-4567-89ab-123456789abc");
    const getRandomValues = mock(() => { throw new Error("unused fallback"); });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID, getRandomValues } });
    expect(createRequestId()).toBe("12345678-1234-4567-89ab-123456789abc");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
});

test.each([
    [0x00, "00000000-0000-4000-8000-000000000000"],
    [0xff, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
] as const)("HTTP fallback preserves UUID v4 version and variant bits for byte %i", (byte, expected) => {
    const getRandomValues = mock((bytes: Uint8Array) => bytes.fill(byte));
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues } });
    expect(createRequestId()).toBe(expected);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0]![0]).toHaveLength(16);
});

test("does not fall back to weak randomness when secure randomness fails", () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
        getRandomValues: () => { throw new Error("randomness unavailable"); },
    } });
    expect(createRequestId).toThrow("randomness unavailable");
});
