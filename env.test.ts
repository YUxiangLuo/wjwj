import { expect, test } from "bun:test";

test("bun test loads DB_NAME from .env.test", () => {
    expect(process.env.DB_NAME).toBe("wenjuan_test");
});
