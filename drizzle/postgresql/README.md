# PostgreSQL migrations

This directory contains the clean empty-database baseline (`0000`) and subsequent additive migrations.

- `0000` enables `citext` and creates the baseline application schema.
- `0002` adds nullable topic variable dictionaries and an envelope constraint.
- `0003` adds a monotone dictionary revision that survives invalidation, carrying forward any already-confirmed revision. Existing legacy dictionaries remain null. Databases on this baseline upgrade with `db:migrate`, not reset.
- The baseline replaces the previous migration history. Existing databases
  must be reset or replaced; they cannot migrate in place.
- `bun run db:migrate` refuses to apply it over a pre-simplification schema
  (`public.submission`) or over application tables that have no
  `drizzle.__drizzle_migrations` row.
- Generate new files with `bun run db:generate`, review the SQL, then apply
  with `bun run db:migrate`.

See [DATABASE.md](../../DATABASE.md) for reset, seed, and collation repair.
