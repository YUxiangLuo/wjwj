import { type Page, type BrowserContext, type Browser } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import type { Subprocess } from "bun";

// ── Shared types ──────────────────────────────────────────────────────────────

export type ApiResponse<T> = {
    status: number;
    ok: boolean;
    body: T | null;
    rawText: string | null;
};

export type ApiEnvelope<T> = {
    success: boolean;
    data?: T;
    error?: {
        code?: string;
        message?: string;
    };
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const projectRoot = process.cwd();
export const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const runId = Date.now().toString().slice(-6);
export const shouldResetDb = process.env.E2E_SKIP_DB_RESET !== "1";
export const shouldReseedDb = process.env.E2E_SKIP_DB_RESEED !== "1";
export const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === "1";

// ── Shell helpers ─────────────────────────────────────────────────────────────

type CommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

type RunCommandOptions = {
    allowFailure?: boolean;
    cwd?: string;
};

function formatCommand(cmd: string[]) {
    return cmd.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

export async function runCommand(cmd: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
    const proc = Bun.spawn({
        cmd,
        cwd: options.cwd ?? projectRoot,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    const result: CommandResult = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
    };

    if (exitCode !== 0 && !options.allowFailure) {
        const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
        throw new Error(`Command failed (${exitCode}): ${formatCommand(cmd)}${details ? `\n${details}` : ""}`);
    }

    return result;
}

// ── Server management ─────────────────────────────────────────────────────────

let serverProcess: Subprocess<"pipe", "pipe", "pipe"> | null = null;

export async function resetDatabase() {
    if (!shouldResetDb) {
        return;
    }
    console.log("[e2e] Resetting database");
    await runCommand(["bun", "run", "db:reset"]);
}

export async function reseedDatabase() {
    if (!shouldReseedDb) {
        return;
    }
    console.log("[e2e] Restoring seed data");
    await runCommand(["bun", "run", "db:seed"]);
}

export async function startServer() {
    if (useExistingServer) {
        return;
    }

    console.log("[e2e] Starting server");
    serverProcess = Bun.spawn({
        cmd: ["bun", "run", "start:e2e"],
        cwd: projectRoot,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });

    await waitFor(
        async () => {
            try {
                const response = await fetch(`${baseUrl}/admin/login`);
                return response.ok ? true : false;
            } catch {
                if (serverProcess && (await Promise.race([serverProcess.exited.then(() => true), delay(0).then(() => false)]))) {
                    const logs = await collectServerLogs();
                    throw new Error(`Server exited before becoming ready.\n${logs}`);
                }
                return false;
            }
        },
        20000,
        500,
    );
}

async function collectServerLogs() {
    if (!serverProcess) {
        return "";
    }

    await Promise.race([serverProcess.exited, delay(250)]);
    const [stdout, stderr] = await Promise.all([
        new Response(serverProcess.stdout).text().catch(() => ""),
        new Response(serverProcess.stderr).text().catch(() => ""),
    ]);
    return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

export async function stopServer() {
    if (!serverProcess) {
        return;
    }

    const proc = serverProcess;
    serverProcess = null;
    proc.kill();
    await proc.exited;
}

// ── Browser session management ────────────────────────────────────────────────

export async function createSession(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext();
    const page = await context.newPage();
    return { context, page };
}

export async function closeSession(context: BrowserContext) {
    await context.close();
}

// ── Generic polling ───────────────────────────────────────────────────────────

export async function waitFor<T>(
    check: () => Promise<T | false>,
    timeoutMs = 15000,
    intervalMs = 300,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
        try {
            const result = await check();
            if (result !== false) {
                return result;
            }
        } catch (error) {
            lastError = error;
        }
        await delay(intervalMs);
    }

    throw new Error(
        lastError instanceof Error
            ? `Timed out: ${lastError.message}`
            : "Timed out waiting for condition",
    );
}

// ── Playwright-based browser helpers ──────────────────────────────────────────

export async function browserFetch<T>(
    page: Page,
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<ApiResponse<T>> {
    const payload = {
        path,
        init: {
            method: init?.method ?? "GET",
            body: init?.body === undefined ? undefined : JSON.stringify(init.body),
            headers: init?.headers ?? {},
        },
    };

    return page.evaluate(async (p) => {
        const headers = new Headers(p.init.headers);
        if (p.init.body !== undefined && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(p.path, {
            method: p.init.method,
            body: p.init.body,
            headers,
            credentials: "include",
        });

        const text = await response.text();
        let body = null;
        if (text) {
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
        }
        return {
            status: response.status,
            ok: response.ok,
            body,
            rawText: text || null,
        };
    }, payload);
}

export async function selectOptionByText(page: Page, triggerSelector: string, optionText: string) {
    await page.locator(triggerSelector).click();
    await waitFor(async () => {
        const clicked = await page.evaluate((text) => {
            const option = Array.from(document.querySelectorAll('[role="option"], [data-radix-collection-item]'))
                .find((element) => {
                    const t = element.textContent?.trim() ?? "";
                    return t === text || t.includes(text);
                });
            if (!option || !(option instanceof HTMLElement)) {
                return false;
            }
            option.click();
            return true;
        }, optionText);
        return clicked ? true : false;
    });
    await page.waitForTimeout(250);
}

export async function clickButtonByText(page: Page, label: string) {
    const clicked = await page.evaluate((lbl) => {
        const button = Array.from(document.querySelectorAll("button"))
            .find((element) => element.textContent?.trim().includes(lbl));
        if (!button) {
            return false;
        }
        button.click();
        return true;
    }, label);
    if (!clicked) {
        throw new Error(`Could not find button with label containing "${label}"`);
    }
}

export async function clickByTestId(page: Page, testId: string) {
    await page.locator(`[data-testid="${testId}"]`).click();
}

export async function fillByTestId(page: Page, testId: string, value: string) {
    await page.locator(`[data-testid="${testId}"]`).fill(value);
}

export async function setFileInputFromUrl(page: Page, inputSelector: string, fileUrl: string, fileName: string) {
    const buffer = await page.evaluate(async ({ url }) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
    }, { url: fileUrl });

    await page.locator(inputSelector).setInputFiles({
        name: fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(buffer),
    });
}
