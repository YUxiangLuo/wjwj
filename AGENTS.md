# Working agreements

Bun is the runtime and toolchain. Use `bun <file>`, `bun test`, `bun build`,
`bun install`, `bun run <script>`, and `bunx <package>` instead of their Node
equivalents. Bun loads `.env` automatically, so do not add dotenv.

Prefer built-ins over dependencies: `Bun.serve` (not Express), `bun:sqlite`,
`Bun.sql`, the built-in `WebSocket`, `Bun.file` (not `node:fs`), and `Bun.$`
(not execa). For Bun API details, read `node_modules/bun-types/docs/**.mdx`.

- Product overview and commands: [README.md](README.md)
- Database operations: [DATABASE.md](DATABASE.md)
- Security, production headers, dependency audit: [SECURITY.md](SECURITY.md)
- Theme tokens and the local shadcn fork: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- Release acceptance, risk hotspots and statistics baselines: [TESTER_RISK_CHECKLIST.md](docs/TESTER_RISK_CHECKLIST.md), [STATISTICAL_TEST_CHECKLIST.md](docs/STATISTICAL_TEST_CHECKLIST.md)

## Style System

- Use the single theme source in `styles/theme.css`; do not create per-app theme copies.
- Do not use Tailwind palette classes such as `bg-slate-50`, `text-indigo-500`, `border-emerald-500/20`, or `shadow-rose-500/20` in TSX.
- Use semantic tokens instead: `background`, `foreground`, `card`, `muted`, `primary`, `success`, `warning`, `info`, `destructive`, and `auxiliary`.
- `X-foreground` always means "text on a filled `bg-X`" (e.g. `bg-auxiliary text-auxiliary-foreground`). For standalone emphasized auxiliary text on normal backgrounds, use `text-auxiliary-strong`.
- Status badges should use `StatusBadge`; repeated icon stat tiles should use `IconTile`; repeated page section headers should use `PageHeader`.
- Use semantic typography utilities: `text-display`, `text-page-title`, `text-section-title`, `text-subheading`, `text-body`, `text-label`, and `text-meta`. Normal HTML text must not be smaller than 14px.
- Use `rounded-control`, `rounded-surface`, and `rounded-overlay`; reserve `rounded-circle` for real circles and `rounded-toggle` for switch tracks. Only floating UI may use `shadow-floating`.
- Do not compose semantic colors with opacity suffixes. Use explicit `*-muted`, `*-border`, and `*-hover` tokens.
- Raw type/radius/shadow utilities, gradients, blur effects, hover scale/translation, and `transition-all` are rejected by `check:styles`.
- `src/components/ui/**` is a local shadcn fork with behavior and accessibility changes. Inspect updates with the pinned `bun run audit:shadcn [component ...]` command; never overwrite these files from the registry.
- The project is light-only: there is no dark theme, no theme toggle, and `dark:` variants must never be used.
- Run `bun run check:styles` after style changes.

## This repository

- Three SPAs: `src/student`, `src/teacher`, `src/admin`. One `Bun.serve` entry in `src/index.ts`.
- Do not import `src/server/**`, `src/db/**`, or `storage-files` from SPA pages or components. Browser bundles have no `process.cwd()`.
- Production `scripts/build.ts` inlines `process.env.DEV_AUTH_MODE` to `"0"`. Read those env vars as member expressions so `define` can replace them.
- PPS default size-field selection lives in `src/student/experiment/pps-size-field.ts`.
