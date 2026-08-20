# AGENTS.md

## Repo state

- JobFlow backend, scaffolded from the tutorial in `README.md`. `README.md`'s code snippets model a **movie watchlist** (User/Movie/WatchList) — that schema is GONE. The real schema is the JobFlow job-tracker; do not follow the README's model/field names.
- Live DB: Neon Postgres (`DATABASE_URL` in `.env`, real). Migration applied: `prisma/migrations/20260820051955_jobflow_init`.

## Schema (`prisma/schema.prisma`)

- Models: `User`, `Application`, `Interview`, `Reminder`, `TimelineEvent` — table/column names are snake_case via `@map` (`users`, `applications`, `password_hash`, `user_id`, ...).
- Client accessors are camelCase of model names: `prisma.user`, `prisma.application`, `prisma.interview`, `prisma.reminder`, `prisma.timelineEvent`.
- Enums: `Stage` (SAVED..ACCEPTED), `Source`, `Priority` (default MEDIUM), `TimelineType`.
  - `Source` members use `@map` for spaced values: `Company_site`→"Company site", `Job_board`→"Job board", `Cold_email`→"Cold email".
  - `TimelineType` members are **lowercase** (`stage`, `note`, `interview`).
- UUID ids: `@default(uuid())` is client-generated (no DB `gen_random_uuid()` default).

## Stack (verified — non-obvious)

- Node >= 22.6 (24 used). ESM only — `"type": "module"`, imports with extensions.
- **Prisma 7**, not v6. Quirks:
  - `prisma-client` generator outputs a TS client to `src/generated/prisma/client.ts` (gitignored). Import directly: `import { PrismaClient } from '../generated/prisma/client.ts'`.
  - Requires driver adapter: `PrismaPg` from `@prisma/adapter-pg` with `DATABASE_URL`.
  - CLI does not auto-load `.env`; `prisma.config.ts` imports `dotenv/config`.
  - Run `npx prisma generate` after any schema change.

## Commands

```bash
npx prisma validate        # check schema
npx prisma migrate dev     # create + apply migrations
npx prisma generate        # after schema changes
node prisma/seed.js        # optional demo data
npm run dev                # nodemon dev server
npm start                  # node src/server.js
```

- No test framework configured — `npm test` fails; verify by running the server or a prisma script.

## Gotchas

- `import 'dotenv/config'` must be the **first** import in `src/config/db.connect.js`; otherwise `DATABASE_URL` is `undefined` → `SASL: client password must be a string`.
- `$connect()` resolves even with a bad URL (pg Pool is lazy) — "Database connected" does NOT prove the DB is reachable; run a real query to verify.
- `express.json()` must be registered before routes; clients must send `Content-Type: application/json`.
- `.env` (gitignored) has `PORT`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`. `dotenv` does not override existing env vars.