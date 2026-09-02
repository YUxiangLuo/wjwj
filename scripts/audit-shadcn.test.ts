import { expect, test } from "bun:test";

import {
  resolveAuditComponents,
  SHADCN_CLI_VERSION,
  SHADCN_REGISTRY_COMPONENTS,
} from "./audit-shadcn";

test("the shadcn audit is pinned and covers every locally owned registry primitive", async () => {
  expect(SHADCN_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(resolveAuditComponents([])).toEqual([...SHADCN_REGISTRY_COMPONENTS]);

  for (const component of SHADCN_REGISTRY_COMPONENTS) {
    expect(await Bun.file(`src/components/ui/${component}.tsx`).exists()).toBe(true);
  }
});

test("the shadcn audit accepts a deduplicated subset and rejects unknown components", () => {
  expect(resolveAuditComponents(["select", "button", "select"])).toEqual([
    "select",
    "button",
  ]);
  expect(() => resolveAuditComponents(["datetime-picker"])).toThrow(
    "Unknown local shadcn component",
  );
});
