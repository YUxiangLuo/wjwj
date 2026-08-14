# PostgreSQL migrations

This directory is the active migration history (`0000`–`0004`).

- `0000` is the empty-database baseline (`citext` plus application tables).
- `bun run db:migrate` refuses to apply it over a pre-simplification schema
  (`public.submission`) or over application tables that have no
  `drizzle.__drizzle_migrations` row.
- Generate new files with `bun run db:generate`, review the SQL, then apply
  with `bun run db:migrate`.

See [DATABASE.md](../../DATABASE.md) for reset, seed, and collation repair.
