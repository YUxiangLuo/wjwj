# PostgreSQL migration runbook

The application now uses PostgreSQL through Bun SQL and Drizzle's `bun-sql`
adapter. `DATABASE_URL` is the only runtime database setting.

## Prepare the target

Create a new, empty PostgreSQL database. Do not point the application at it
until the copy and validation finish.

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate
```

The migration enables `citext`, creates all tables and indexes, and installs
`updated_at` triggers. The PostgreSQL migration history lives in
`drizzle/postgresql`; the SQL files directly under `drizzle/` are retained only
as the legacy MySQL history.

The role applying the first migration must be allowed to run
`CREATE EXTENSION citext`; otherwise a database administrator must install
that extension in the target database first.

Schema changes use the migration workflow: update `src/db/schema.ts`, run
`bun run db:generate`, review the generated SQL, and run `bun run db:migrate`.
The project intentionally does not expose drizzle-kit's `push`, `studio`, or
`drop` commands because those commands require a Node PostgreSQL driver and
cannot use the project's Bun SQL connection.

## Copy existing data

Stop application writes or put the service into maintenance mode before the
final copy. The target must be empty; the copy tool refuses to append to a
populated database.

```sh
export MYSQL_SOURCE_URL='mysql://user:password@127.0.0.1:3306/wenjuan'
export MYSQL_TIMEZONE_OFFSET='+09:00'
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate:mysql-to-postgres
```

The tool copies all 21 application tables in one PostgreSQL transaction,
preserves IDs, converts JSON and timestamps, resets identity sequences, and
then compares every row. It also checks core relationships for orphan rows.
Transient `scheduler.*` lease keys are intentionally not copied.

JSON is transferred as raw text and parsed by PostgreSQL, rather than by
JavaScript, so integers beyond JavaScript's safe range remain exact and JSON
`null` remains distinct from SQL `NULL`.

`MYSQL_TIMEZONE_OFFSET` must describe the timezone in which legacy MySQL
`DATETIME` values were written. The current deployment uses `+09:00`.

## Validate and cut over

Run the database contract test and the normal project checks before changing
traffic:

```sh
TEST_DATABASE_URL="$DATABASE_URL" bun run test:db
bun run typecheck
bun test
bun run build
```

Then configure the service with the validated PostgreSQL `DATABASE_URL` and
restart it. Keep the old MySQL/MariaDB database read-only until the rollback
window closes.

## Rollback

If validation or the post-cutover smoke test fails, stop writes to PostgreSQL,
restore the previous application version and MySQL connection settings, and
restart against the untouched MySQL/MariaDB database. Writes accepted by
PostgreSQL after cutover are not copied back automatically, so rollback should
happen before reopening traffic or must include a separately reviewed reverse
data reconciliation.
