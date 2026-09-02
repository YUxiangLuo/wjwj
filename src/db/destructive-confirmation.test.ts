import { expect, test } from "bun:test";
import { databaseNameFromUrl, validateDatabaseConfirmation } from "./destructive-confirmation";

test("database confirmation requires the exact decoded database name", () => {
    const url = "postgresql://user:secret@127.0.0.1:5432/wj%20test";
    expect(databaseNameFromUrl(url)).toBe("wj test");
    expect(validateDatabaseConfirmation(url, "wj test")).toBeNull();
    expect(validateDatabaseConfirmation(url, "wj")).toContain("CONFIRM_DATABASE_NAME=wj test");
    expect(validateDatabaseConfirmation("not-a-url", "anything")).toBe("DATABASE_URL 中缺少有效数据库名");
});
