
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
- Maintained primitives and shared shells use semantic shape/elevation utilities: `rounded-control`, `rounded-surface`, `rounded-overlay`, `rounded-feature`, and `shadow-control`, `shadow-surface`, `shadow-floating`, `shadow-emphasis`.
- Existing page-level raw radius and shadow utilities are migration debt guarded by `check:styles`; do not increase their ratchet counts.
- `src/components/ui/**` is a local shadcn fork with behavior and accessibility changes. Inspect updates with `bunx shadcn@latest add <component> --diff -y`; never overwrite these files from the registry.
- The project is light-only: there is no dark theme, no theme toggle, and `dark:` variants must never be used.
- Run `bun run check:styles` after style changes.

## This repository

- Three SPAs: `src/student`, `src/teacher`, `src/admin`. One `Bun.serve` entry in `src/index.ts`.
- Do not import `src/server/**`, `src/db/**`, or `storage-files` from SPA pages or components. Browser bundles have no `process.cwd()`.
- Production `scripts/build.ts` inlines `process.env.DEV_AUTH_MODE` to `"0"`. Read those env vars as member expressions so `define` can replace them.
- PPS default size-field selection lives in `src/student/experiment/pps-size-field.ts`.
- Overview: [README.md](README.md). Database: [DATABASE.md](DATABASE.md). Security: [SECURITY.md](SECURITY.md).
