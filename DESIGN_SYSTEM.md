# Design system

The application uses an institutional-blue, light-only design system built with Tailwind CSS v4 and locally owned shadcn-style primitives. `styles/theme.css` is the single source of truth for all three SPAs; application code must use semantic tokens rather than Tailwind palette colors or opacity-composed colors.

## Layers

1. **Theme tokens** — color, shape, elevation, type, motion, and desktop-only rules in `styles/theme.css`.
2. **UI primitives** — locally maintained Radix/shadcn forks in `src/components/ui`.
3. **Shared patterns** — `StatusBadge`, `IconTile`, `PageHeader`, `AuthLoginScreen`, `DatetimePicker24`, and the workspace shell/sidebar.
4. **Pages and features** — compose primitives and patterns; they do not define new theme copies.

## Color and typography

- `background` is the pale blue-gray application canvas; `card` and `popover` are solid white surfaces.
- `navigation` is the dark institutional-blue shell surface. Use its `navigation-foreground`, `navigation-muted`, `navigation-active`, and `navigation-border` companions inside navigation chrome.
- `primary`, `success`, `warning`, `info`, `destructive`, and `auxiliary` each have explicit `*-muted` and `*-border` tones. Do not construct those tones with `/10` or `/20` opacity modifiers.
- Chart colors are the only intentionally multihued palette. Status and actions must use semantic intent tokens instead. Heatmaps use the explicit `heatmap-low`, `heatmap-moderate`, `heatmap-high`, and `heatmap-maximum` bands so data intensity never depends on opacity composition.

Use semantic type utilities instead of the Tailwind T-shirt scale:

| Role | Size / line height | Typical use |
| --- | --- | --- |
| `text-display` | 32 / 42px | login or immersive-stage display titles |
| `text-page-title` | 24 / 32px | page titles and primary numeric values |
| `text-section-title` | 20 / 28px | section headings |
| `text-subheading` | 18 / 26px | card and dialog headings |
| `text-body` | 16 / 26px | normal reading text |
| `text-label` | 15 / 22px | controls, labels, and navigation |
| `text-meta` | 14 / 20px | timestamps, identifiers, and short supporting text |

Normal HTML text must never be smaller than 14px. Twelve-pixel text is reserved for SVG chart ticks. Labels use foreground text; `muted-foreground` is for genuinely supporting information, not primary instructions.

## Shape and elevation

Use role-based utilities in maintained components:

| Role | Radius | Typical use |
| --- | --- | --- |
| `rounded-control` | 2px | buttons, inputs, tabs, badges, and navigation items |
| `rounded-surface` | 2px | cards and grouped surfaces |
| `rounded-overlay` | 4px | dialogs, popovers, and select menus |
| `rounded-circle` | circle | avatars, status dots, chart points, and slider thumbs only |
| `rounded-toggle` | pill | switch tracks only |

Regular controls and surfaces are separated with borders rather than shadows. `shadow-floating` is reserved for dialogs, menus, popovers, and other content that physically floats above the page. Do not use raw radius/shadow utilities, colored shadows, gradients, glow/blur effects, hover scaling, or `transition-all`.

Default controls are 40px high, compact controls are 36px, and prominent controls are 44px. Disabled controls use explicit muted colors instead of whole-element opacity.

## Local shadcn fork policy

The primitives are not disposable generated files. Dialog and AlertDialog restore focus for controlled use, and AlertDialog accepts a `fallbackFocusRef` for openers that unmount before it closes (for example a logout item inside an account menu); Button exports `IconButton`; `TableHead` declares `scope="col"` by default so every table associates its headers with cells; Select mirrors Radix's hidden background state to native `inert` and enforces accessible names; Slider and Progress enforce accessible names. `DatetimePicker24` is a shared composite outside the registry directory and owns application timezone behavior.

- Inspect all upstream changes with `bun run audit:shadcn`, or a focused subset with `bun run audit:shadcn button select`. The audit pins CLI behavior while still exposing upstream registry changes; update the pin deliberately in `scripts/audit-shadcn.ts`.
- Never run shadcn with `--overwrite` against this repository.
- Port useful upstream changes manually while preserving the light-only, desktop-only, semantic-token, and accessibility contracts.
- Do not migrate to the `radix-ui` aggregate package as part of a style-only change.

## Validation

Run `bun run check:styles` after style changes. The guard rejects palette utilities, dark or responsive variants, opacity-composed semantic colors, unsafe semantic color combinations, raw type/radius/shadow utilities, and decorative effects. It also validates the theme's WCAG text/status contrast and non-text input-boundary contrast. Finish with `bun run verify` and agent-browser screenshots of the three portals. `audit:shadcn` is a network-backed maintenance command and intentionally remains outside `verify`.
