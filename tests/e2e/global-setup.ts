import { spawnSync } from "node:child_process";

function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        env: process.env,
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
}

export default async function globalSetup() {
    const shouldResetDb = process.env.E2E_RESET_DB !== "0";

    if (!shouldResetDb) {
        return;
    }

    run("bun", ["run", "db:reset"]);
}
