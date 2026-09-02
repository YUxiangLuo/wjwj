export const SHADCN_CLI_VERSION = "4.19.1";

export const SHADCN_REGISTRY_COMPONENTS = [
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

const registryComponentSet = new Set<string>(SHADCN_REGISTRY_COMPONENTS);

export function resolveAuditComponents(arguments_: readonly string[]) {
  if (arguments_.length === 0) return [...SHADCN_REGISTRY_COMPONENTS];

  const unknown = arguments_.filter((component) => !registryComponentSet.has(component));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown local shadcn component(s): ${unknown.join(", ")}. `
      + `Expected one of: ${SHADCN_REGISTRY_COMPONENTS.join(", ")}.`,
    );
  }
  return [...new Set(arguments_)];
}

async function main() {
  const components = resolveAuditComponents(process.argv.slice(2));
  console.log(
    `Comparing ${components.length} local component(s) with shadcn CLI ${SHADCN_CLI_VERSION}.`,
  );

  for (const component of components) {
    console.log(`\n=== ${component} ===`);
    const process = Bun.spawn(
      ["bunx", `shadcn@${SHADCN_CLI_VERSION}`, "add", component, "--diff", "-y"],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: globalThis.process.env,
      },
    );
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      throw new Error(`shadcn audit failed for ${component} (exit ${exitCode}).`);
    }
  }
}

if (import.meta.main) {
  await main();
}
