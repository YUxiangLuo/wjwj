
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

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

Project-specific经验:

- Admin, teacher, student 都跑在同一个 origin 下，cookie 会互相影响。跨端回归时务必用独立 session，例如 `agent-browser --session admin ...`、`agent-browser --session teacher ...`、`agent-browser --session student ...`。
- 页面跳转、弹窗开关、列表刷新后，旧的 `@e*` ref 很容易失效。不要复用旧 ref，先重新 `snapshot` 再继续操作。
- 不要只看 toast 就判断成功，必须再抓一次 `snapshot` 验证列表、状态、数量或弹窗文案已经实际变化。
- 本项目很多动作按钮没有稳定 test id，优先用“先搜索/过滤缩小结果，再点当前快照中的行内按钮”的方式，不要硬编码数据库 id。
- 富文本公告编辑器是 `contenteditable`，不是普通 `textarea`。优先直接定位 `div[contenteditable='true']`；如果 `fill` 不稳定，就用 `agent-browser eval` 设置 `textContent` / `innerHTML` 并补发 `input` 事件。
- 导出类能力优先用 `agent-browser download <sel> <path>`，下载后再用 shell 读取文件内容做断言。
- 如果要测 PDF/附件/导出这类依赖真实文件的功能，而种子数据里刚好没有可用样本，不要停在“缺数据”上。可以直接在 `storage/uploads/**` 生成最小可用 fixture 文件，再把路径回填到种子或目标记录；如果这个场景后续还会反复测，优先把 fixture 生成逻辑写进 `src/db/seeds/default.ts`，保证 `bun run db:seed` 后可重复复现。
- `agent-browser` 点 PDF “预览”时，新标签页有时只会停在 `about:blank`，不要据此判定功能失败。优先同时验证 3 件事：按钮是否出现、受权 `fetch('/api/.../pdf/...')` 是否返回 `200 + application/pdf`、`agent-browser download` 是否能把文件真实落盘。
- 需要验证“首次登录改密”“管理员重置密码后强制改密”“锁定/停用恢复”这类状态流时，建议在一轮结束后执行 `bun run db:seed` 恢复标准种子状态；只有需要完全清空额外数据时才用 `bun run db:reset`。
- `agent-browser network requests` 在开发模式 + HMR 下可能重复记录同一批请求。做“请求次数”判断时，不要只信它；必要时用 `agent-browser eval` 在页面里包一层 `window.fetch` 统计真实调用次数。
- 某些负向路径会被 UI 禁住，例如“当前学期删除”“草稿公告统计”。这种场景优先复用已登录 session，用 `agent-browser eval` 直接 `fetch('/api/...', { credentials: 'include' })` 验证后端返回，而不是强行操作禁用控件。
- 排查“是不是多标签页/多会话噪音”时，先跑 `agent-browser tab list --session <name>`；确认只剩一个标签页后，再判断请求或状态是否重复。
