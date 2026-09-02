# PostgreSQL migrations

This directory contains the clean empty-database baseline (`0000`).

- `0000` enables `citext` and creates the complete current application schema.
- The baseline replaces the previous migration history. Existing databases
  must be reset or replaced; they cannot migrate in place.
- `bun run db:migrate` refuses to apply it over a pre-simplification schema
  (`public.submission`) or over application tables that have no
  `drizzle.__drizzle_migrations` row.
- Generate new files with `bun run db:generate`, review the SQL, then apply
  with `bun run db:migrate`.

See [DATABASE.md](../../DATABASE.md) for reset, seed, and collation repair.
