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
submission paths. Upload, copy, delete, audit, and cleanup operations share a
PostgreSQL advisory lock, so cleanup cannot classify a file while its database
reference is still being committed by the application.

## Repair a collation version mismatch

An operating-system libc/ICU upgrade can change sort rules after a database
has recorded its collation version. Do not silence the warning by refreshing
the version marker first: indexes whose ordering depends on the old rules must
be rebuilt before the catalog version is updated.

Check the recorded and current versions:

```sql
SELECT
    datname,
    datcollversion AS recorded_version,
    pg_database_collation_actual_version(oid) AS actual_version
FROM pg_database
WHERE datname = current_database();
```

For the local development database, use a maintenance window:

1. Stop application processes that can write to the database.
2. Take a restorable backup outside the repository:

   ```sh
   pg_dump "$DATABASE_URL" --format=custom --file=/safe/path/wenjuan-before-collation-repair.dump
   ```

3. Rebuild database indexes using a connection to the affected database:

   ```sql
   REINDEX DATABASE wenjuan_pg_dev;
   ```

4. Only after `REINDEX` succeeds, refresh the database version marker:

   ```sql
   ALTER DATABASE wenjuan_pg_dev REFRESH COLLATION VERSION;
   ```

5. Re-run the version query, application database test, and a representative
   case-insensitive lookup. Keep the backup until those checks pass.

Use the real database identifier for non-development deployments and quote it
when necessary. `ALTER DATABASE ... REFRESH COLLATION VERSION` only updates
metadata; it does not verify that affected objects were rebuilt.
