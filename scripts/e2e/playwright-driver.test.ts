import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeAllBrowserSessions, runPlaywrightCommand } from "./playwright-driver";

let server: Bun.Server<undefined>;
let baseUrl = "";
let downloadDir = "";

beforeAll(async () => {
    downloadDir = await mkdtemp(join(tmpdir(), "playwright-driver-"));

    server = Bun.serve({
        port: 0,
        fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === "/download") {
                return new Response("playwright download", {
                    headers: {
                        "Content-Type": "text/plain",
                        "Content-Disposition": 'attachment; filename="example.txt"',
                    },
                });
            }

            return new Response(`
                <!doctype html>
                <html lang="zh-CN">
                    <body>
                        <input id="name" />
                        <button id="submit" onclick="window.clicked = true; document.querySelector('#status').textContent = document.querySelector('#name').value;">提交</button>
                        <div id="status"></div>
                        <a data-testid="download-link" download href="/download">下载文件</a>
                    </body>
                </html>
            `, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        },
    });

    baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
    await closeAllBrowserSessions();
    await server.stop(true);
    await rm(downloadDir, { recursive: true, force: true });
});

test("runPlaywrightCommand supports interactive browser commands", async () => {
    const session = "playwright-driver-test";
    const destination = join(downloadDir, "example.txt");

    expect((await runPlaywrightCommand(["open", baseUrl], session)).exitCode).toBe(0);
    expect((await runPlaywrightCommand(["fill", "#name", "迁移成功"], session)).exitCode).toBe(0);
    expect((await runPlaywrightCommand(["click", "#submit"], session)).exitCode).toBe(0);

    const evalResult = await runPlaywrightCommand(["eval", "({ clicked: window.clicked === true, text: document.querySelector('#status')?.textContent ?? '' })"], session);
    expect(evalResult.exitCode).toBe(0);
    expect(JSON.parse(evalResult.stdout)).toEqual({
        clicked: true,
        text: "迁移成功",
    });

    const snapshot = await runPlaywrightCommand(["snapshot", "-i"], session);
    expect(snapshot.exitCode).toBe(0);
    expect(snapshot.stdout).toContain('下载文件');

    const refMatch = snapshot.stdout.match(/下载文件" \[ref=(e\d+)\]/);
    expect(refMatch).toBeTruthy();

    const downloadResult = await runPlaywrightCommand(["download", `@${refMatch![1]}`, destination], session);
    expect(downloadResult.exitCode).toBe(0);

    const downloadedFile = Bun.file(destination);
    expect(await downloadedFile.text()).toBe("playwright download");

    expect((await runPlaywrightCommand(["close"], session)).exitCode).toBe(0);
});
