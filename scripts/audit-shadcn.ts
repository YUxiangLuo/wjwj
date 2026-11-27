export const MUI_UI_PRIMITIVES = [
  "alert-dialog",
  "avatar",
  "badge",
  "button",
  "card",
  "dialog",
  "input",
  "label",
  "popover",
  "progress",
  "select",
  "separator",
  "slider",
  "switch",
  "table",
  "tabs",
  "textarea",
] as const;

/** Kept as an alias so existing scripts and references stay compatible. */
export const SHADCN_REGISTRY_COMPONENTS = MUI_UI_PRIMITIVES;

const primitiveSet = new Set<string>(MUI_UI_PRIMITIVES);

const FORBIDDEN_RADIX_PRIMITIVES = [
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-avatar",
  "@radix-ui/react-compose-refs",
  "@radix-ui/react-dialog",
  "@radix-ui/react-label",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
] as const;

export function resolveAuditComponents(arguments_: readonly string[]) {
  if (arguments_.length === 0) return [...MUI_UI_PRIMITIVES];

  const unknown = arguments_.filter((component) => !primitiveSet.has(component));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown local UI primitive(s): ${unknown.join(", ")}. `
      + `Expected one of: ${MUI_UI_PRIMITIVES.join(", ")}.`,
    );
  }
  return [...new Set(arguments_)];
}

export async function auditUiPrimitives(components: readonly string[]) {
  const issues: string[] = [];

  for (const component of components) {
    const path = `src/components/ui/${component}.tsx`;
    const file = Bun.file(path);
    if (!(await file.exists())) {
      issues.push(`${path}: missing UI primitive module.`);
      continue;
    }

    const source = await file.text();
    if (!source.includes("@mui/material")) {
      issues.push(`${path}: must be backed by @mui/material.`);
    }
    for (const legacyPkg of FORBIDDEN_RADIX_PRIMITIVES) {
      if (source.includes(legacyPkg)) {
        issues.push(`${path}: contains legacy Radix import ${legacyPkg}; keep it migrated to @mui/material.`);
      }
    }
  }

  const pkg = (await Bun.file("package.json").json()) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declaredDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const legacyPkg of FORBIDDEN_RADIX_PRIMITIVES) {
    if (legacyPkg in declaredDeps) {
      issues.push(`package.json: unused legacy Radix dependency ${legacyPkg} must be removed.`);
    }
  }

  return issues;
}

async function main() {
  const components = resolveAuditComponents(process.argv.slice(2));
  const issues = await auditUiPrimitives(components);
  if (issues.length > 0) {
    console.error("UI primitive audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log(
    `Verified ${components.length} local UI primitive(s) in src/components/ui/** are backed by @mui/material with MD3 contracts intact.`,
  );
}

if (import.meta.main) {
  await main();
}
