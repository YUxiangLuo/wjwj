
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.


## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Fast loop:
1. `agent-browser open <url>`
2. `agent-browser snapshot -i`
3. Interact with `click @e*` / `fill @e* "..."` / `eval`
4. After any navigation, dialog toggle, tab switch, or list refresh, run `snapshot` again

Project rules:

- Admin、teacher、assistant、student 共用同一个 origin。跨端或跨账号测试一律用独立 session，例如 `--session admin`、`--session teacher`、`--session assistant`、`--session student`。
- student 同一个账号也是单端登录。不要在两个 session 里并行复用同一个 student 账号。
- 不要相信旧 `@e*` ref，也不要只看 toast。动作后先重新 `snapshot`，再验证列表、状态、数量或弹窗文案的实际变化。
- 列表操作优先“先搜索/过滤，再点当前快照里的行内按钮”。不要硬编码数据库 id，也不要用 `nth()` 猜同名按钮顺序。
- 富文本编辑器优先定位 `div[contenteditable='true']`。如果 `fill` 不稳定，就用 `agent-browser eval` 设置 `textContent` / `innerHTML` 并补发 `input` 事件。
- 导出、附件、PDF 一律优先用 `agent-browser download <sel> <path>`，下载后再用 shell 断言文件内容。开过弹窗、切过 tab、列表刚刷新时，先重新 `snapshot` 再下载。
- PDF “预览”偶尔会停在 `about:blank`。不要据此判失败，优先同时验证按钮可见、受权 `fetch` 返回 `200 + application/pdf`、文件可真实下载。
- 测首次登录改密、重置密码、驳回后重做、提交实验、锁定/停用恢复这类会改状态的链路后，执行 `bun run db:seed` 恢复环境。当前 seed 会清掉测试新增的 `submission`。
- `agent-browser network requests` 在开发模式 + HMR 下可能重复记请求。真要看请求次数时，用 `eval` 包一层 `window.fetch` 自己统计。
- UI 明确禁掉的负向路径，优先用已登录 session 配合 `agent-browser eval` 发 `fetch(..., { credentials: 'include' })` 验证后端返回。
- 如果怀疑是多标签页或多会话噪音，先跑 `agent-browser tab list --session <name>`。
- teacher 登录页同时接受 teacher 和 assistant 账号。assistant 登录后默认落到 `/grading`，其余教师专属页面会被重定向。

Seed fixtures:

- 所有 seed 账号默认密码都是 `123456`，除非本轮测试里刚被改过或重置过。

Admin fixtures:

- `admin`：管理员主账号，适合登录、仪表盘、学期、公告、系统设置、备份恢复。
- 教师管理目标：`teacher` 正常；`T004` 首次登录；`T005` 停用；`T006` 锁定。
- 助教管理目标：`assistant` 正常；`A004` 首次登录；`A005` 锁定。
- 学生管理目标：`2024013` 首次登录；`2024014` 锁定；`2024204` 停用；`2024003` 驳回后可重做；`2024006` 阶段 4 进行中。

Teacher fixtures:

- `teacher`：教师主账号，数据最全。拥有当前学期 A 班、市场调研方法班、往期班；有已发布课题、草稿课题、待批改提交、已批改提交、未读通知，优先用于课题、任务、批阅、导出、助教管理主链路。
- `T002`：B 班与下学期班级，适合补另一位教师的数据隔离、任务发布、导出筛选。
- `T003`：数据挖掘班，数据量较小，适合快速验证批阅和进度详情。
- `T004`：首次登录强制改密。
- `T005`：停用教师。
- `T006`：锁定教师。

Assistant fixtures:

- `assistant`：助教主账号，分配到 A 班和市场调研方法班，适合助教登录、通知、批阅权限、只读/受限导航。
- `A002`：只绑定 A 班，适合更小范围的班级可见性测试。
- `A003`：只绑定 B 班，适合跨教师数据隔离验证。
- `A004`：首次登录强制改密。
- `A005`：锁定助教。

Student fixtures:

- `2024005`：阶段 3 抽样执行。
- `2024006`：阶段 4 分析页、导出、预览、提交。
- `2024003`：驳回后重做。
- `2024013`：首次登录强制改密。
- `2024014`：锁定账号。
- `2024204`：停用账号。
- `2024001` / `2024009`：提交详情页 PDF 下载。
- `2024002`：已批改详情查看；PDF 按钮默认禁用，不适合测 PDF 下载。
- student 阶段 4 当前真实流程：分析页“完成并预览报告”直接跳 `/student/task/:id/preview`，真正的“确认提交”只在预览页发生。
