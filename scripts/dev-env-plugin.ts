import type { BunPlugin } from "bun";
import { resolveDevAuthMode } from "../src/lib/dev-mode";

// Bun.serve does not expose private server env variables to browser bundles.
// Inline only the resolved public flag; keep bunfig's BUN_PUBLIC_* allowlist.
export default {
    name: "development-auth-mode",
    setup(build) {
        const mode = JSON.stringify(resolveDevAuthMode(process.env) ? "1" : "0");
        const environment = JSON.stringify(process.env.NODE_ENV ?? "development");
        build.onLoad({ filter: /[/\\]dev-mode\.ts$/ }, async ({ path }) => ({
            loader: "ts",
            contents: (await Bun.file(path).text())
                .replaceAll("process.env.DEV_AUTH_MODE", mode)
                .replaceAll("process.env.NODE_ENV", environment),
        }));
    },
} satisfies BunPlugin;
