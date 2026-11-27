import { expect, test } from "bun:test";

import {
  auditUiPrimitives,
  MUI_UI_PRIMITIVES,
  resolveAuditComponents,
  SHADCN_REGISTRY_COMPONENTS,
} from "./audit-shadcn";

test("the UI primitive audit covers every locally owned @mui/material primitive", async () => {
  expect(SHADCN_REGISTRY_COMPONENTS).toEqual(MUI_UI_PRIMITIVES);
  expect(resolveAuditComponents([])).toEqual([...MUI_UI_PRIMITIVES]);

  const issues = await auditUiPrimitives(MUI_UI_PRIMITIVES);
  expect(issues).toEqual([]);
});

test("the UI primitive audit accepts a deduplicated subset and rejects unknown components", () => {
  expect(resolveAuditComponents(["select", "button", "select"])).toEqual([
    "select",
    "button",
  ]);
  expect(() => resolveAuditComponents(["datetime-picker"])).toThrow(
    "Unknown local UI primitive",
  );
});
