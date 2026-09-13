# PostgreSQL migrations

`0000` is the complete empty-database baseline and enables `citext`. It replaces the old migration history: existing databases cannot apply it in place and must be backed up and replaced or deliberately reset.

Generate migrations with `bun run db:generate`, review the SQL, then run `bun run db:migrate`. The migrator rejects incompatible pre-baseline schemas.

See [DATABASE.md](../../DATABASE.md) for protected reset, backup/restore, and collation repair procedures.
