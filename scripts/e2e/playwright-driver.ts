import { mkdir } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Download, type Locator, type Page } from "playwright-core";

export type CommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

type SnapshotRef = {
    label: string;
    selector: string | null;
    role: string;
};

type SessionState = {
    context: BrowserContext;
    page: Page;
    refs: Map<string, SnapshotRef>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
let browserPromise: Promise<Browser> | null = null;
const sessions = new Map<string, SessionState>();

function ok(stdout = ""): CommandResult {
    return { stdout, stderr: "", exitCode: 0 };
}

function commandError(message: string): CommandResult {
    return { stdout: "", stderr: message, exitCode: 1 };
}

function getBrowser() {
    browserPromise ??= chromium.launch({
        headless: true,
    });
    return browserPromise;
}

async function getSession(sessionName: string) {
    const existing = sessions.get(sessionName);
    if (existing) {
        return existing;
    }

    const browser = await getBrowser();
    const context = await browser.newContext({
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    const state: SessionState = { context, page, refs: new Map() };
    sessions.set(sessionName, state);
    return state;
}

async function createSnapshot(state: SessionState) {
    const entries = await state.page.evaluate(() => {
        function computeLabel(element: Element) {
            const ariaLabel = element.getAttribute("aria-label")?.trim();
            if (ariaLabel) return ariaLabel;

            if (element instanceof HTMLInputElement) {
                const inputLabel = element.value.trim() || element.placeholder.trim();
                if (inputLabel) return inputLabel;
            }

            const text = element.textContent?.replace(/\s+/g, " ").trim();
            if (text) return text;

            const title = element.getAttribute("title")?.trim();
            if (title) return title;

            return null;
        }

        function selectorFor(element: Element) {
            const testId = element.getAttribute("data-testid");
            if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;

            const id = element.getAttribute("id");
            if (id) return `#${id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;

            return null;
        }

        function isVisible(element: Element) {
            if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
                return false;
            }

            const style = window.getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") {
                return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        const elements = Array.from(
            document.querySelectorAll("a, button, input[type=button], input[type=submit], [role=button], [role=link]"),
        );

        return elements.flatMap((element) => {
            if (!isVisible(element)) {
                return [];
            }

            const label = computeLabel(element);
            if (!label) {
                return [];
            }

            return [{
                label,
                selector: selectorFor(element),
                role: element.getAttribute("role") || element.tagName.toLowerCase(),
            }];
        });
    });

    state.refs.clear();

    const lines = entries.map((entry, index) => {
        const ref = `e${index + 1}`;
        state.refs.set(ref, entry);
        return `${entry.role} "${entry.label}" [ref=${ref}]`;
    });

    return lines.join("\n");
}

function locatorByText(page: Page, label: string) {
    return page.getByRole("button", { name: label, exact: true })
        .or(page.getByRole("link", { name: label, exact: true }))
        .or(page.getByLabel(label, { exact: true }))
        .or(page.getByText(label, { exact: true }))
        .first();
}

function resolveLocator(state: SessionState, rawTarget: string) {
    if (rawTarget.startsWith("@")) {
        const ref = rawTarget.slice(1);
        const snapshotRef = state.refs.get(ref);
        if (!snapshotRef) {
            throw new Error(`Unknown snapshot ref: ${rawTarget}`);
        }

        if (snapshotRef.selector) {
            return state.page.locator(snapshotRef.selector).first();
        }

        return locatorByText(state.page, snapshotRef.label);
    }

    return state.page.locator(rawTarget).first();
}

async function clickForDownload(page: Page, locator: Locator) {
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        locator.click(),
    ]);
    return download;
}

async function saveDownload(download: Download, destination: string) {
    const directory = destination.includes("/") ? destination.slice(0, destination.lastIndexOf("/")) : "";
    if (directory) {
        await mkdir(directory, { recursive: true });
    }
    await download.saveAs(destination);
}

async function executeEval(page: Page, source: string) {
    return page.evaluate(async (code) => {
        return await (0, eval)(code);
    }, source);
}

export async function ensureBrowser() {
    await getBrowser();
}

export async function closeBrowserSession(sessionName: string) {
    const session = sessions.get(sessionName);
    if (!session) {
        return;
    }

    sessions.delete(sessionName);
    await session.context.close();
}

export async function closeAllBrowserSessions() {
    for (const sessionName of Array.from(sessions.keys())) {
        await closeBrowserSession(sessionName);
    }

    if (browserPromise) {
        const browser = await browserPromise;
        browserPromise = null;
        await browser.close();
    }
}

export async function runPlaywrightCommand(args: string[], sessionName: string): Promise<CommandResult> {
    try {
        const command = args[0];
        if (!command) {
            return commandError("Missing browser command");
        }

        if (command === "close") {
            await closeBrowserSession(sessionName);
            return ok();
        }

        const state = await getSession(sessionName);

        switch (command) {
            case "open": {
                const url = args[1];
                if (!url) {
                    return commandError("Missing URL for open command");
                }
                await state.page.goto(url, { waitUntil: "domcontentloaded" });
                return ok();
            }

            case "wait": {
                const ms = Number(args[1] ?? "0");
                await state.page.waitForTimeout(Number.isFinite(ms) ? ms : 0);
                return ok();
            }

            case "click": {
                const target = args[1];
                if (!target) {
                    return commandError("Missing selector for click command");
                }
                await resolveLocator(state, target).click();
                return ok();
            }

            case "fill": {
                const target = args[1];
                const value = args[2] ?? "";
                if (!target) {
                    return commandError("Missing selector for fill command");
                }
                await resolveLocator(state, target).fill(value);
                return ok();
            }

            case "press": {
                const key = args[1];
                if (!key) {
                    return commandError("Missing key for press command");
                }
                await state.page.keyboard.press(key);
                return ok();
            }

            case "eval": {
                const source = args[1];
                if (source === undefined) {
                    return commandError("Missing source for eval command");
                }
                const value = await executeEval(state.page, source);
                return ok(value === undefined ? "" : JSON.stringify(value));
            }

            case "download": {
                const target = args[1];
                const destination = args[2];
                if (!target || !destination) {
                    return commandError("Missing arguments for download command");
                }
                const locator = resolveLocator(state, target);
                const download = await clickForDownload(state.page, locator);
                await saveDownload(download, destination);
                return ok(destination);
            }

            case "snapshot": {
                return ok(await createSnapshot(state));
            }

            default:
                return commandError(`Unsupported browser command: ${command}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        return commandError(message);
    }
}
