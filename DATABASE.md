# PostgreSQL operations

The application uses PostgreSQL through Bun SQL and Drizzle's `bun-sql`
adapter. `DATABASE_URL` is the only runtime database setting. Product
overview and seed accounts are in [README.md](README.md).

Active tables: `admin`, `teacher`, `student`, `semester`, `class`,
`topic`, `topic_attachment`, `task`, `experiment`, `announcement`,
`user_session`. Migrations live in `drizzle/postgresql` (`0000`–`0004`).

## Create the database

Create an empty PostgreSQL database and export its connection URL:

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate
bun run db:seed
```

The first migration enables `citext` and creates the application tables,
foreign keys, constraints, and indexes. The role applying it must be
allowed to run `CREATE EXTENSION citext`; otherwise a database administrator
must install that extension first.

This repository uses a simplified-schema baseline intended for an empty
database. `db:migrate` stops if it sees the former schema (`public.submission`)
or application tables without a `drizzle.__drizzle_migrations` record. For an
installation from before the simplification, first take a database and
`storage/` backup. If retaining the old records is not required, run
`bun run db:reset`; otherwise keep the old database for export and deploy this
version against a new empty database.

`db:seed` writes the deterministic dogfood fixture in
`src/db/seeds/default.ts`: 1 admin, 3 teachers, 2 semesters, 2 classes,
S010–S020, 7 topics, 6 tasks, 11 experiments, 4 announcements, 1 attachment,
and two generated population files. The main proportion/PPS task covers all
eight teacher progress buckets; the mean task has a valid numeric analysis
field but intentionally no eligible PPS size field. `SEED_NOW` optionally fixes
the relative-time anchor, and `SEED_ADMIN_PASSWORD` overrides the generated
admin password. See the exact credentials/personas in [README.md](README.md).
Seed is not applied by `db:migrate`.

`db:seed` is non-idempotent and only supports an empty migrated database. It
preflights the required guide source before inserting rows, but later failures
can still leave partial rows or generated files. Fix the reported cause, then
run `bun run db:reset` to clean and rebuild the database instead of retrying
seed against the partial state. Run `bun run db:seed:check` immediately after a
successful seed for the read-only fixture integrity check.

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
submission paths. Soft-deleted topics and their attachments are intentionally
excluded from current references because the product does not provide a restore
flow; their files therefore appear in the audit before cleanup. Upload, copy,
delete, audit, and cleanup operations share a
PostgreSQL advisory lock, so cleanup cannot classify a file while its database
reference is still being committed by the application.

## Coordinated single-instance backup and restore

PostgreSQL rows and `storage/` files form one backup set. For a consistent
single-instance backup, enter a maintenance window and stop every application
process that can upload, replace, or delete files. Then create both artifacts
under the same timestamp outside the repository:

```sh
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir=/safe/path
pg_dump "$DATABASE_URL" --format=custom --file="$backup_dir/wenjuan-$stamp.dump"
tar -C "$(pwd)" -czf "$backup_dir/wenjuan-storage-$stamp.tar.gz" storage
(
  cd "$backup_dir"
  sha256sum "wenjuan-$stamp.dump" "wenjuan-storage-$stamp.tar.gz" \
    > "wenjuan-$stamp.sha256"
)
```

The checksum manifest deliberately contains basenames so the set can be moved
and verified from its own directory. Keep the dump, storage archive, checksum
file, application commit, and migration version together. Before any restore,
verify both artifacts, then restore into a disposable empty PostgreSQL database
and an empty application storage location using the same application version:

```sh
stamp=20260814T120000Z
backup_dir=/safe/path
app_dir=/srv/wenjuan
RESTORE_DATABASE_URL='postgresql://restore_user:password@127.0.0.1:5432/wenjuan_restore_test'

(cd "$backup_dir" && sha256sum --check "wenjuan-$stamp.sha256")
pg_restore --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" "$backup_dir/wenjuan-$stamp.dump"
test ! -e "$app_dir/storage" || { echo "restore storage path must not exist" >&2; exit 1; }
tar -C "$app_dir" -xzf "$backup_dir/wenjuan-storage-$stamp.tar.gz"

cd "$app_dir"
DATABASE_URL="$RESTORE_DATABASE_URL" bun run db:migrate
TEST_DATABASE_URL="$RESTORE_DATABASE_URL" bun run test:db
DATABASE_URL="$RESTORE_DATABASE_URL" bun run storage:audit
```

Use a dedicated disposable restore database: `test:db` intentionally refuses to
fall back to `DATABASE_URL`. After the commands pass, start the application with
`DATABASE_URL="$RESTORE_DATABASE_URL"` and test representative attachment and
population downloads before accepting the backup. Do not restore only one half
of the set or extract over an existing production `storage/` directory.

The current local-filesystem design is intentionally single-instance. Shared
volumes or object storage are required before horizontal multi-instance
deployment and are deferred until that deployment model is needed.

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
