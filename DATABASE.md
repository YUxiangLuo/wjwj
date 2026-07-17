# PostgreSQL operations

The application uses PostgreSQL through Bun SQL and Drizzle's `bun-sql`
adapter. `DATABASE_URL` is the only runtime database setting.

## Create the database

Create an empty PostgreSQL database and export its connection URL:

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate
```

The first migration enables `citext`, creates the application tables and
indexes, and installs the `updated_at` triggers. The role applying it must be
allowed to run `CREATE EXTENSION citext`; otherwise a database administrator
must install that extension first.

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

`bun run db:clean` removes all application data. The package script supplies
the cleaner's required `--force` flag, and `db:reset` invokes it before
reapplying migrations and seed data.
