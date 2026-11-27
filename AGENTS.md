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
- Material Design 3 tokens and `@mui/material` primitives: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- Release acceptance, risk hotspots and statistics baselines: [TESTER_RISK_CHECKLIST.md](docs/TESTER_RISK_CHECKLIST.md), [STATISTICAL_TEST_CHECKLIST.md](docs/STATISTICAL_TEST_CHECKLIST.md)

## Style System

- Use the single Google Material Design 3 Productivity Light theme source in `styles/theme.css` paired with `src/theme/mui-theme.ts` and `MaterialThemeProvider` (`@layer theme, base, mui, components, utilities;` with `<StyledEngineProvider enableCssLayer>` and no global `CssBaseline`); do not create per-app theme copies.
- Keep `MuiButtonBase` ripple disabled (`disableRipple: true`) and overlay transitions synchronous (`transitionDuration: 0` on `Dialog`, `Modal`, `Popover`, `Menu`) for clean MD3 state layers and deterministic DOM/test behavior.
- Eliminate "AI template" clutter: never use dark `#0c213b` sidebars/headers, `.institutional-grid` backgrounds, split dark-poster login screens, rainbow `IconTile` badges on `KpiStatCard`, or stacked tinted callout boxes.
- Do not use Tailwind palette classes such as `bg-slate-50`, `text-indigo-500`, `border-emerald-500/20`, or `shadow-rose-500/20` in TSX.
- Use MD3 semantic tokens instead: `background` (`#f8fafd`), `foreground` (`#1f1f1f`), `card` (`#ffffff`), `muted` (`#f0f4f9`), `primary` (`#0b57d0`), `accent` (`#c2e7ff`), `navigation-*`, `success`, `warning`, `info`, `destructive`, and `auxiliary`.
- `X-foreground` always means "text on a filled `bg-X`" (e.g. `bg-auxiliary text-auxiliary-foreground`). For standalone emphasized auxiliary text on normal backgrounds, use `text-auxiliary-strong`.
- Status badges should use `StatusBadge` (MUI `Chip`, `8px` radius); understated tonal icon containers should use `IconTile`; clean analytics metric cards should use `KpiStatCard` (no colored `IconTile`); page section headers should use `PageHeader`.
- Use semantic typography utilities (`Roboto` + `Noto Sans SC`): `text-display`, `text-page-title`, `text-section-title`, `text-subheading`, `text-body`, `text-label`, and `text-meta`. Prefer `font-medium` (500) over heavy bolds; normal HTML text must not be smaller than 14px.
- Use MD3 semantic shapes: `rounded-pill` (`9999px` for buttons and active nav pills), `rounded-control` (`8px` for inputs, selects, chips), `rounded-surface` (`12px` for cards, menus, popovers), and `rounded-overlay` (`24px` for dialogs and login cards); reserve `rounded-circle` for real circles and `rounded-toggle` for switch tracks. Only floating UI may use `shadow-floating`.
- Do not compose semantic colors with opacity suffixes. Use explicit `*-muted`, `*-border`, and `*-hover` tokens.
- Raw type/radius/shadow utilities, gradients, blur effects, hover scale/translation, and `transition-all` are rejected by `check:styles`.
- `src/components/ui/**` is backed by `@mui/material` while preserving compound APIs and accessibility contracts (`accessible-name.ts`, `TableHead scope="col"`, controlled overlay focus restore, `inert` background isolation). Verify with `bun run audit:shadcn [component ...]`; never overwrite these files from the shadcn registry.
- The project is light-only (desktop `>=1024×768`): there is no dark theme, no theme toggle, and `dark:` or viewport-responsive variants must never be used.
- Run `bun run check:styles` after style changes.

## This repository

- Three SPAs: `src/student`, `src/teacher`, `src/admin`. One `Bun.serve` entry in `src/index.ts`.
- Do not import `src/server/**`, `src/db/**`, or `storage-files` from SPA pages or components. Browser bundles have no `process.cwd()`.
- Production `scripts/build.ts` inlines `process.env.DEV_AUTH_MODE` to `"0"`. Read those env vars as member expressions so `define` can replace them.
- PPS default size-field selection lives in `src/student/experiment/pps-size-field.ts`.
