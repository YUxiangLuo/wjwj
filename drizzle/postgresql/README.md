# PostgreSQL migrations

This directory contains the clean empty-database baseline (`0000`) and subsequent incremental migrations.

- `0000` enables `citext` and creates the baseline application schema.
- `0002` adds nullable topic variable dictionaries and an envelope constraint.
- `0003` adds a monotone dictionary revision that survives invalidation, carrying forward any already-confirmed revision. Existing legacy dictionaries remain null. Databases on this baseline upgrade with `db:migrate`, not reset.
- `0004` merges choice labels and identities into native `options: [{ id, label }]` in recommendations, saved questionnaires and submitted questionnaires. It preserves existing labels/IDs/bindings and all reports, grades and versions; only formerly unbound options without IDs receive an explicit one-time allocation. Malformed or ambiguous input aborts the transaction. Stop writers and take a paired backup first; no runtime dual-format reader is supplied.
- `0005` adds immutable successful research-analysis documents, experiment reference IDs and a monotone sampling-completion revision. Existing completed samples are explicitly anchored to their current experiment version; other revisions start at zero. No past analyses are fabricated, and original versions, reports, snapshots and grades are unchanged. Back up the database/storage pair and stop writers before the upgrade.
- The baseline replaces the previous migration history. Existing databases
  must be reset or replaced; they cannot migrate in place.
- `bun run db:migrate` refuses to apply it over a pre-simplification schema
  (`public.submission`) or over application tables that have no
  `drizzle.__drizzle_migrations` row.
- Generate new files with `bun run db:generate`, review the SQL, then apply
  with `bun run db:migrate`.

See [DATABASE.md](../../DATABASE.md) for reset, seed, and collation repair.
