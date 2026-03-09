import { expect, test } from "bun:test";

import { collectThemeValidationIssues } from "./migrate-theme";

test("theme refactor stays fully migrated", async () => {
    const issues = await collectThemeValidationIssues(process.cwd());

    expect(issues).toEqual([]);
});
