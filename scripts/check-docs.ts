import { dirname, resolve } from "node:path";

if (import.meta.main) {
    const issues: string[] = [];
    // 删除或移动文档后，现行文档不能留下悬空的本地文件链接。
    for (const pattern of ["*.md", "docs/**/*.md", "drizzle/**/*.md"]) {
        for await (const path of new Bun.Glob(pattern).scan()) {
            const text = await Bun.file(path).text();
            for (const match of text.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
                const target = match[1]!;
                if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
                const filePath = decodeURIComponent(target.split(/[?#]/, 1)[0]!);
                if (!(await Bun.file(resolve(dirname(path), filePath)).exists())) {
                    issues.push(`${path} 链接不存在：${target}`);
                }
            }
        }
    }
    if (issues.length) throw new Error(`文档检查失败：\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    console.log("Documentation local file links are valid.");
}
