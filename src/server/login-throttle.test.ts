import { expect, test } from "bun:test";
import { LoginAttemptThrottle } from "./login-throttle";

test("login throttle bounds account/IP attempts and resets its time window", () => {
    const throttle = new LoginAttemptThrottle();
    for (let index = 0; index < 8; index += 1) {
        expect(throttle.consume("203.0.113.9", "student", "S001", 1_000)).toBe(true);
    }
    expect(throttle.consume("203.0.113.9", "student", "S001", 1_000)).toBe(false);
    expect(throttle.consume("203.0.113.9", "student", "S002", 1_000)).toBe(true);
    expect(throttle.consume("203.0.113.9", "student", "S001", 62_000)).toBe(true);
});

test("successful login can clear only its account/IP counter", () => {
    const throttle = new LoginAttemptThrottle();
    for (let index = 0; index < 8; index += 1) throttle.consume("203.0.113.8", "admin", "admin", 1_000);
    throttle.clear("203.0.113.8", "admin", "admin");
    expect(throttle.consume("203.0.113.8", "admin", "admin", 1_000)).toBe(true);
});
