# JobFlow Server

Backend API for **JobFlow**, a job-application tracker. Express 5 + Prisma 7 + Postgres.

Users register, log in, and manage **job applications** — each application can carry interviews, reminders, and a timeline of events (stage changes, notes, scheduled interviews). All `/applications` routes are protected: the JWT is read from a cookie or the `Authorization` header.

> ⚠️ Earlier versions of this README modeled a "movie watchlist". That schema is **gone**. This document describes the current JobFlow job-tracker schema and code only.

---

## 1. Tech Stack

| Piece        | What it is |
|--------------|-----------|
| Node.js      | Runtime — **Node ≥ 22.6 required** (24 recommended). Prisma 7 generates TypeScript and Node strips types natively (ESM, no build step) |
| Express 5    | HTTP server / routing framework |
| Prisma 7     | ORM — talks to Postgres for us. Requires a **driver adapter** (`PrismaPg`) |
| Postgres     | Database (Neon hosted instance) |
| bcrypt       | Hash and compare passwords |
| jsonwebtoken | Create/verify JWT tokens |
| cookie-parser| Parse the `jobflow_token` cookie into `req.cookies` |
| cors         | Allow the frontend (different origin) to call the API |
| zod          | Define + validate request bodies, params, and `PATCH` actions |
| dotenv       | Load secrets from `.env` |
| nodemon      | Auto-restarts the server while developing |

---

## 2. Project Structure

```
job_flow_server/
├── .env                     # secrets (gitignored) — never commit!
├── .gitignore
├── package.json
├── prisma.config.ts         # Prisma CLI config (loads .env + schema path)
├── prisma/
│   ├── schema.prisma        # models: User, Application, Interview, Reminder, TimelineEvent
│   └── migrations/          # SQL migration files (generated)
└── src/
    ├── server.js            # entry point — assembles middleware + routes
    ├── config/
    │   └── db.connect.js    # Prisma client + driver adapter + connect/disconnect
    ├── middleware/
    │   └── authMiddleware.js # verifies the JWT and loads the user into req.user
    ├── controller/
    │   ├── authController.js        # register / login / logout
    │   └── applicationController.js # CRUD + interviews/reminders/notes/stage actions
    ├── routes/
    │   ├── authRoutes.js            # /auth/register, /auth/login, /auth/logout
    │   └── applicationRoutes.js     # /applications (protected)
    ├── utils/
    │   └── generateToken.js         # signs a JWT and sets the cookie
    ├── Validators/
    │   ├── validate.js              # generic zod validation middleware
    │   ├── authValidator.js         # register/login schemas
    │   └── applicationValidator.js  # application + patch-action schemas
    └── generated/prisma/            # generated Prisma client (gitignored)
```

Request flow: **route → middleware → validator → controller → Prisma → Postgres**.

---

## 3. Setup

### 3.1 Prerequisites

- Node.js ≥ 22.6 (24 recommended)
- A Postgres database (this project uses a remote Neon Postgres URL)

### 3.2 Install dependencies

```bash
npm install
```

Scripts in `package.json`:

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "nodemon src/server.js",
  "seed": "node ./prisma/seed.js"
}
```

> Note: `prisma/seed.js` does **not** exist yet — the `seed` script is a placeholder.

### 3.3 Create `.env`

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://USER:PASSWORD@HOST/dbname"
JWT_SECRET="any-long-random-string"
CLIENT_URL="http://localhost:3000"
```

> ⚠️ Never commit `.env`. It is already in `.gitignore`. `dotenv` does **not** override variables already set in your shell.

---

## 4. Database Schema — `prisma/schema.prisma`

Five models: `User`, `Application`, `Interview`, `Reminder`, `TimelineEvent`. Table/column names are snake_case via `@map`; Prisma client accessors are camelCase (`prisma.user`, `prisma.application`, ...).

```prisma
enum Stage { SAVED APPLIED SCREENING INTERVIEW OFFER ACCEPTED }

enum Source {
  Referral
  LinkedIn
  Company_site @map("Company site")
  Job_board    @map("Job board")
  Cold_email   @map("Cold email")
  Recruiter
  Other
}

enum Priority { LOW MEDIUM HIGH }

enum TimelineType { stage note interview }
```

| Model          | Purpose                                        | Key columns / relations |
|----------------|------------------------------------------------|--------------------------|
| `User`         | Account holder. `password_hash` stores a bcrypt hash | `email` unique, preference flags, `applications[]` |
| `Application`  | One job application owned by a user            | `company`, `role`, `source`, `stage`, `priority`; `@@index([userId])`, `@@index([stage])` |
| `Interview`    | A scheduled interview for an application       | `kind`, `withWhom`, `at` |
| `Reminder`     | A follow-up/to-do attached to an application   | `label`, `at`, `done` |
| `TimelineEvent`| One entry in the application's history         | `label`, `type` (stage/note/interview), `at` |

Key points:
- All PKs are `String @id @default(uuid())` — **UUIDs are generated client-side** (there is no DB `gen_random_uuid()` default).
- `Interview`, `Reminder`, `TimelineEvent` each `@relation(fields: [applicationId], references: [id], onDelete: Cascade)` — deleting an application deletes its children.
- `Source` members use `@map` for **spaced values** ("Company site", "Job board", "Cold email").
- `TimelineType` members are **lowercase** (`stage`, `note`, `interview`).

### Prisma CLI config — `prisma.config.ts`

Prisma CLI does **not** auto-load `.env`, so the config imports `dotenv/config` and points at the schema + migration folder.

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
```

### Generate the client / migrate

```bash
npx prisma generate          # writes client to src/generated/prisma (gitignored)
npx prisma migrate dev       # apply pending migrations to the DB
npx prisma migrate dev --name init   # only if you change the schema
npx prisma validate          # check the schema is valid
```

> Run `npx prisma generate` again after **any** schema change. Migration files land in `prisma/migrations/`.

---

## 5. Database connection — `src/config/db.connect.js`

**Prisma 7 requires a driver adapter.** Here we use `PrismaPg` from `@prisma/adapter-pg` with your `DATABASE_URL`.

> ⚠️ `import 'dotenv/config'` must be the **first** import in this file. ESM imports run before the rest of the file, so if dotenv is imported later, `DATABASE_URL` is `undefined` → `SASL: client password must be a string`.

```js
import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client.ts'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'info', 'warn'] : ['error']
})

export { prisma, dbConnect, dbClose }
```

> ⚠️ `$connect()` resolves even with a bad URL (pg Pool is lazy). "Database connected" does **not** prove the DB is reachable — run a real query to verify.

---

## 6. Token helper — `src/utils/generateToken.js`

Signs a JWT and stores it in an **httpOnly cookie** (safer than localStorage — browser JS can't read it, so XSS can't steal it).

```js
const generateToken = (userId, res) => {
    const payload = { id: userId }
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" })
    res.cookie("jobflow_token", token, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV !== "development",
    })
    return token
}
```

- Payload is `{ id: userId }` → the middleware reads `decoded.id` to find the user.
- `expiresIn: '7d'` → valid 7 days. `httpOnly` → not readable by JS. `sameSite: 'strict'` → CSRF protection. `secure` → HTTPS only outside development.
- The cookie name is **`jobflow_token`** (matches `authMiddleware` and `LogOut`).

---

## 7. Auth — `src/controller/authController.js`, `src/routes/authRoutes.js`

The pattern for every handler: `try/catch`, validate, talk to the DB via `prisma`, return JSON.

- **register** — rejects existing emails (`400`), hashes the password with `bcrypt` (never store plaintext), creates the user, issues a token, returns `201`.
- **login** — `400` if email/password missing, `404` if user not found, `401` if `bcrypt.compare` fails, otherwise issues a token and returns `200`.
- **logout** — clears the `jobflow_token` cookie and returns `200`.

Status-code mapping: `400` bad input, `404` missing user, `401` wrong password, `201` created, `200` ok, `500` server error.

`authRoutes.js` also wires up zod validation:

```js
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", LogOut);
```

Mounted at `/auth` in `server.js`:
- `POST /auth/register` — `{ name, email, password }`
- `POST /auth/login` — `{ email, password }`
- `POST /auth/logout`

> `req.body` comes from `express.json()` — the client **must** send `Content-Type: application/json`.

---

## 8. Auth middleware — `src/middleware/authMiddleware.js`

Runs before every `/applications` route and answers: *"is this user logged in?"*

```js
const authMiddleware = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.jobflow_token) {
        token = req.cookies.jobflow_token;
    }
    if (!token) return res.status(401).json({ ... });   // no token

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ ... }); // token valid, user deleted
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ ... });                    // bad/expired/tampered token
    }
}
```

Key ideas:
- Accepts a token from either the `Authorization: Bearer <token>` header **or** the `jobflow_token` cookie.
- `jwt.verify` with the same `JWT_SECRET` used to sign it; a wrong/expired/tampered token throws → `401`.
- On success sets `req.user = user` (the full DB row) so controllers use `req.user.id`.

---

## 9. Validation — `src/Validators/validate.js`

A generic factory that validates `req.body`, `req.params`, or `req.query` with a zod schema:

```js
export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({
      success: false, statusCode: 400, message: "Validation failed",
      errors: result.error.errors.map((e) => ({
        field: e.path.join("."), message: e.message,
      })),
    });
  }
  req[source] = result.data;   // replaces req.body/req.params with parsed data
  next();
};
```

- `safeParse` returns `{ success, data }` or `{ success, error }` — no exceptions.
- On success the parsed data **replaces** `req[source]`, so defaults from `z.default()` apply.
- `source = "params"` validates a `:id` route param (`validate(idSchema, "params")`).

### Zod schemas — `src/Validators/`

- **`authValidator.js`** — `registerSchema` (`name` ≥ 2 chars, valid `email`, `password` ≥ 6) and `loginSchema`.
- **`applicationValidator.js`** —
  - `createApplicationSchema` — requires `company`, `role`, `source`, `stage`; enums restricted to the `STAGES`/`SOURCES`/`PRIORITIES` arrays.
  - `updateApplicationSchema` — `.partial()` (any subset) but at least one field, used by `PUT`.
  - `patchApplicationSchema` — a `z.discriminatedUnion("action", ...)` covering the five actions below.
  - `idSchema` — `id` must be a UUID (for `req.params`).

---

## 10. Application controller — `src/controller/applicationController.js`

All handlers assume `authMiddleware` ran, so `req.user.id` is the logged-in user. Every query is scoped by `userId` (users can never touch another user's data).

Shared behavior:
- `applicationInclude` — every fetch also returns the application's `interviews`, `reminders`, and `timelineEvents`.
- `toClient(app)` — maps DB rows to a clean client shape (`timeline` instead of `timelineEvents`, empty arrays instead of `null`).

| Handler | HTTP | What it does |
|---------|------|--------------|
| `getApplications` | GET `/` | All of the user's applications, newest `updatedAt` first |
| `getApplication` | GET `/:id` | One application (scoped to the user), `404` if missing |
| `createApplication` | POST `/` | Creates an application and an initial `"Application submitted"` timeline event |
| `updateApplication` | PUT `/:id` | Full update; auto-appends a `"Moved to <stage>"` event when the stage changes |
| `patchApplication` | PATCH `/:id` | Action-based update (see below) |
| `deleteApplication` | DELETE `/:id` | Deletes the application (cascades to children) |

### `PATCH /applications/:id` actions

The request body is `{ action, ...payload }` where `action` is one of:

| action           | Payload                                    | Effect |
|------------------|--------------------------------------------|--------|
| `note`           | `{ text }`                                 | Overwrites `notes`, adds a "Note added" event |
| `interview`      | `{ kind, withWhom?, at }`                  | Creates an `Interview` + "Interview scheduled" event |
| `reminder`       | `{ label, at }`                            | Creates a `Reminder` |
| `toggleReminder` | `{ reminderId }`                           | Flips the reminder's `done` flag |
| `stage`          | `{ stage }`                                | Changes stage + "Moved to <stage>" event |

Unknown `action` → `400`.

---

## 11. Routes

### 11.1 Auth routes — `src/routes/authRoutes.js`

Mounted at `/auth`. Public. See [§7](#7-auth--srccontrollerauthcontrollerjs-srcroutesauthroutesjs).

### 11.2 Application routes — `src/routes/applicationRoutes.js`

```js
router.use(authMiddleware);                     // protects every route below

router.route("/")
  .get(getApplications)
  .post(validate(createApplicationSchema), createApplication);

router.route("/:id")
  .get(validate(idSchema, "params"), getApplication)
  .put(validate(idSchema, "params"), validate(updateApplicationSchema), updateApplication)
  .patch(validate(idSchema, "params"), validate(patchApplicationSchema), patchApplication)
  .delete(validate(idSchema, "params"), deleteApplication);
```

Mounted at `/applications`. Middleware runs **left to right**: `authMiddleware` → `validate` → handler, so handlers can trust `req.user` exists and `req.body`/`req.params` are valid.

---

## 12. Entry point — `src/server.js`

Assembles the app: middleware first, then routes, then listening, plus graceful shutdown.

```js
const app = express()
const port = process.env.PORT || 5000

app.use(express.json())    // parse JSON bodies → req.body
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }))
app.use(cookieParser())    // parse cookies → req.cookies

dbConnect()

app.use("/auth", authRoutes)
app.use("/applications", applicationRoutes)

app.get("/", (req, res) => res.json({ message: "Hello World!", success: true, statusCode: 200, error: null }))
```

- `express.json()` must be registered **before** the routes.
- CORS allows only `CLIENT_URL` (default `http://localhost:3000`) with `credentials: true` so the frontend can send cookies.
- `SIGTERM`/`SIGINT`/`unhandledRejection`/`uncaughtException` handlers close the DB before exiting.

---

## 13. Run it

```bash
npx prisma generate      # first time only (and after schema changes)
npx prisma migrate dev   # first time only — applies migrations to create tables
npm run dev              # nodemon — auto-reloads on save
```

Check it: open `http://localhost:5000` → `{ "message": "Hello World!", ... }`.

---

## 14. API Endpoints

Base URL: `http://localhost:5000`

| Method | URL                    | Auth | Body / Params | What it does |
|--------|------------------------|------|---------------|--------------|
| GET    | `/`                    | no   | —             | Health check |
| POST   | `/auth/register`       | no   | `{ name, email, password }` | Create account + JWT cookie |
| POST   | `/auth/login`          | no   | `{ email, password }` | Log in + JWT cookie |
| POST   | `/auth/logout`         | no   | —             | Clear JWT cookie |
| GET    | `/applications`        | yes  | —             | List my applications |
| POST   | `/applications`        | yes  | `{ company, role, location?, salary?, source, stage, priority?, link?, notes? }` | Create application |
| GET    | `/applications/:id`    | yes  | —             | Get one application |
| PUT    | `/applications/:id`    | yes  | any subset of the create fields (≥1) | Update application |
| PATCH  | `/applications/:id`    | yes  | `{ action, ... }` (see §10) | Add note / interview / reminder / stage change |
| DELETE | `/applications/:id`    | yes  | —             | Delete application |

Protected routes read the JWT from the `Authorization: Bearer <token>` header **or** the `jobflow_token` cookie. Examples (REST Client `.http`):

```http
POST http://localhost:5000/auth/login
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "your-real-plain-password"
}
```

```http
POST http://localhost:5000/applications
Authorization: Bearer <token-from-login>
Content-Type: application/json

{
  "company": "Acme Corp",
  "role": "Backend Engineer",
  "source": "LinkedIn",
  "stage": "APPLIED",
  "priority": "HIGH",
  "link": "https://jobs.acme.com/123",
  "notes": "Referred by Sam."
}
```

```http
PATCH http://localhost:5000/applications/<id>
Authorization: Bearer <token-from-login>
Content-Type: application/json

{
  "action": "interview",
  "kind": "Technical screen",
  "withWhom": "Jane (Hiring Manager)",
  "at": "2026-09-01T15:00:00Z"
}
```

> ⚠️ Send the **plain-text password** you registered with — never a hash. Register stores a bcrypt hash; login compares against it. The token in the login response is what you pass as the Bearer token.

---

## 15. Common Pitfalls

1. **`req.body` is undefined** → the request is missing `Content-Type: application/json`, or `express.json()` is placed after the routes.
2. **`SASL: client password must be a string`** → `DATABASE_URL` is undefined when the adapter is created. `db.connect.js` must `import 'dotenv/config'` as the **first** import.
3. **`TableDoesNotExist`** → run `npx prisma migrate dev` to apply the migrations.
4. **Don't follow Prisma v6 tutorials** → this uses **Prisma 7**: `prisma-client` generator, driver adapter, and a TypeScript-generated client imported from `src/generated/prisma/client.ts`. Run `npx prisma generate` after schema changes.
5. **"Database connected" but queries fail** → `$connect()` is lazy; it resolves even with a bad URL. Test with a real query.
6. **Logout/auth don't clear the cookie** → the cookie is named `jobflow_token`, not `jwt`.
7. **`req.cookies` empty** → `cookie-parser` missing or not added via `app.use(cookieParser())`. The Bearer header still works.
8. **Login always `401 Invalid password`** → you probably tested with the hashed string, not the real password.
9. **`npm test` fails** → no test framework is configured; verify by running the server or a small prisma script.
10. **Validation errors mention unexpected values** → `Source` uses spaced values ("Company site", "Job board", "Cold email"), and `TimelineType` values are lowercase (`stage`, `note`, `interview`).
