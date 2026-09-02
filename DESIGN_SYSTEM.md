# Design system

The application uses Tailwind CSS v4 with locally owned shadcn-style primitives. `styles/theme.css` is the single source of truth for all three SPAs; application code must use semantic tokens rather than Tailwind palette colors.

## Layers

1. **Theme tokens** — color, shape, elevation, type, motion, and desktop-only rules in `styles/theme.css`.
2. **UI primitives** — locally maintained Radix/shadcn forks in `src/components/ui`.
3. **Shared patterns** — `StatusBadge`, `IconTile`, `PageHeader`, `AuthLoginScreen`, and the workspace shell/sidebar.
4. **Pages and features** — compose primitives and patterns; they do not define new theme copies.

## Shape and elevation

Use role-based utilities in maintained components:

| Role | Radius | Typical use |
| --- | --- | --- |
| `rounded-control` | 6px | buttons, inputs, tabs, navigation items |
| `rounded-surface` | 10px | cards and grouped surfaces |
| `rounded-overlay` | 10px | dialogs, popovers, select menus |
| `rounded-feature` | 12px | prominent teaching or authentication panels |

Use `shadow-control`, `shadow-surface`, `shadow-floating`, and `shadow-emphasis` for the corresponding elevation levels. `rounded-full` remains appropriate for avatars, badges, switches, progress tracks, slider thumbs, and status dots.

## Local shadcn fork policy

The primitives are not disposable generated files. Dialog and AlertDialog restore focus for controlled use; Button exports `IconButton`; Select, Slider, and Progress enforce accessible names; DatetimePicker contains application timezone behavior.

- Inspect upstream changes with `bunx shadcn@latest add <component> --diff -y`.
- Never run shadcn with `--overwrite` against this repository.
- Port useful upstream changes manually while preserving the light-only, desktop-only, semantic-token, and accessibility contracts.
- Do not migrate to the `radix-ui` aggregate package as part of a style-only change.

## Validation

Run `bun run check:styles` after style changes. The guard rejects palette utilities, dark or responsive variants, unsafe semantic color combinations, and raw radius/shadow scales inside maintained design-system files. Existing page-level radius, shadow, and colored-shadow usage is protected by a ratchet: counts may decrease during migration but must never increase. Finish with `bun run verify` and browser screenshots of the three portals.
