# PostgreSQL operations

The application uses PostgreSQL through Bun SQL and Drizzle's `bun-sql`
adapter. `DATABASE_URL` is the only runtime database setting.

## Create the database

Create an empty PostgreSQL database and export its connection URL:

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate
```

The first migration enables `citext` and creates the application tables,
foreign keys, constraints, and indexes. The role applying it must be
allowed to run `CREATE EXTENSION citext`; otherwise a database administrator
must install that extension first.

This repository now uses a simplified-schema baseline intended for an empty
database. `db:migrate` detects the former schema (for example, the old
`submission` table) and stops instead of attempting to run `CREATE TABLE`
statements over existing data. For an installation from before the
simplification, first take a database and `storage/` backup. If retaining the
old records is not required, run `bun run db:reset`; otherwise keep the old
database for export and deploy this version against a new empty database.

## Change the schema

1. Update `src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Review the generated SQL under `drizzle/postgresql`.
4. Apply it with `bun run db:migrate`.

The project does not expose Drizzle Kit's `push`, `studio`, or `drop` commands.
Those commands require a separate Node.js database driver and cannot use the
project's Bun SQL connection.

## Validate

Run the database contract test against a disposable test database, then run
the normal project checks:

```sh
TEST_DATABASE_URL="$DATABASE_URL" bun run test:db
bun run db:check
bun run typecheck
bun test
bun run build
```

`bun run db:clean` removes only this project's current and legacy tables plus
its `drizzle` metadata schema. It does not enumerate or delete unrelated
tables in `public`. The package script supplies the cleaner's required
`--force` flag, and `db:reset` invokes it before reapplying migrations and seed
data.

Database reset does not delete files under `storage/`. Replacing a topic's
Excel file removes the previous file after the database update succeeds. For
older orphaned files, first run the read-only audit:

```sh
bun run storage:audit
```

After reviewing the exact list, `bun run storage:clean` deletes only files not
referenced by current topic data, attachments, or recognized legacy
submission paths.
