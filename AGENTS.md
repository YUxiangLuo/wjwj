
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

## Style System

- Use the single theme source in `styles/theme.css`; do not create per-app theme copies.
- Do not use Tailwind palette classes such as `bg-slate-50`, `text-indigo-500`, `border-emerald-500/20`, or `shadow-rose-500/20` in TSX.
- Use semantic tokens instead: `background`, `foreground`, `card`, `muted`, `primary`, `success`, `warning`, `info`, `destructive`, and `auxiliary`.
- `X-foreground` always means "text on a filled `bg-X`" (e.g. `bg-auxiliary text-auxiliary-foreground`). For standalone emphasized auxiliary text on normal backgrounds, use `text-auxiliary-strong`.
- Status badges should use `StatusBadge`; repeated icon stat tiles should use `IconTile`; repeated page section headers should use `PageHeader`.
- The project is light-only: there is no dark theme, no theme toggle, and `dark:` variants must never be used.
- Run `bun run check:styles` after style changes.


use bun/bunx instead of node/npx

use agent-browser as your browser

you can run sudo without password

you are on the newest Archlinux system with 32GB ram, install any package you want

if you are not sure about something, always search it

you can use this psql user to create and use postgresql database: psql -U alice -h 127.0.0.1 -p 5432, password is 111111

you can use this mysql/mariadb user to create and use mysql/mariadb: mariadb -u agent -p 111111


