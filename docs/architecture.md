# Architecture reference

Reference for the parts the README only sketches: repository layout, data access, data model, authentication, the HTTP API and the conventions behind them. The decisions with trade-offs are in the README and in `docs/adr/`, the domain rules in `docs/rules.md`, the threat model in `docs/bedrohungsmodell-rechnungen.md`. The legal and domain documents in `docs/` are in German.

## Repository layout

```
apps/api         NestJS 11, src/ by module, test/ (*.int.spec.ts, helpers/), Dockerfile
apps/web         Vite + React 19, src/ (app, routes, features/<module>, components/ui, i18n, lib/api, styles), Caddyfile
packages/shared  @zeit/shared: zod contracts, error codes, roles
packages/rules   @zeit/rules: domain logic without a framework
packages/demo-data  @zeit/demo-data: deterministic generator
db/migrations    dbmate, hand-written SQL
db/init          database roles (docker-entrypoint-initdb.d)
tests/e2e        Playwright
deploy/          demo/ and live/ Compose projects, host/ files, backup.sh
```

Dependency rules, checked by dependency-cruiser in the CI job `static`:

- `rules` depends only on `temporal-polyfill`. No zod, no Nest, no I/O, no clock: "now" is a parameter.
- `shared` depends only on zod.
- `demo-data` uses `rules` and `shared`.
- `api` uses `shared`, `rules` and, in the `demo/` module only, `demo-data`.
- `web` uses `shared` and `rules` for previews. The server stays authoritative.

The packages are built twice (ESM and CJS plus declarations, with tsup) because Nest stays on CommonJS and Vite needs ESM.

## Data access

Kysely on `pg`. Every request that touches tenant data runs inside `withTenant(session, trx => …)`, which sets the context per transaction:

```ts
await sql`select set_config('app.tenant_id', ${t}, true), set_config('app.user_id', ${u}, true),
	set_config('app.role', ${r}, true), set_config('app.employee_id', ${e}, true),
	set_config('app.request_id', ${rid}, true)`.execute(trx);
```

- `is_local = true`, so the values do not survive in the connection pool.
- The tenant kind is not part of the context. `app.workspace()` reads it from `app.tenants` through `app.tenant_id()` on every call, so the CLI and the jobs, which have no session, get the same answer.
- The API works with `started_at` and `ended_at`. `tstzrange` appears only in the exclusion constraint.
- Database errors map to HTTP in `apps/api/src/db/errors.ts`: `23P01` to 409 `TIME_OVERLAP`, `ZT001` to 409 `PERIOD_LOCKED`, `ZT002` to 409 `APPEND_ONLY`, `ZT003`, `ZT006` and `23503` to 409 `INVALID_STATE`, `ZT004` to 409 `INVOICED`, `ZT005` to 409 `SANDBOX_QUOTA`, `23505` to 409 `ALREADY_EXISTS`, `23514`, `22003` and `22023` to 400 `VALIDATION`, `42501` to 403 `FORBIDDEN`, `28000` to 401 `UNAUTHENTICATED`.
- CI checks schema drift: apply the migrations, run codegen, `git diff --exit-code`. ESLint forbids `sql.raw`.

## Data model

Schemas: `app` (business data, under RLS), `auth`, `audit`, `ops`.

### Database roles

| Role          | Purpose                                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zeit_owner`  | Runs migrations, owns the tables. Never used by the API container.                                                                                                                                                                                             |
| `zeit_app`    | Runtime role. LOGIN, NOBYPASSRLS, DML only, no rights on `auth.*`.                                                                                                                                                                                             |
| `zeit_system` | NOLOGIN, BYPASSRLS. Owns only `SECURITY DEFINER` functions with `search_path = ''`, among them `auth.login_lookup`, `auth.session_create/resolve/revoke`, `auth.token_issue/consume`, `ops.demo_switch_persona`, `ops.expired_sandboxes`, `ops.purge_sandbox`. |

### Conventions for every `app` table

- `id uuid default gen_random_uuid()`, `tenant_id not null`, `unique (tenant_id, id)`, composite foreign keys `(tenant_id, x_id)` so a row can never point into another tenant.
- Extensions `btree_gist` and `citext`. Instants are `timestamptz`, days are `date`. The work day of a time entry is the local date of its start.
- RLS is `ENABLE` plus `FORCE` on all `app` and `audit` tables. The helper `app.tenant_id()` is `nullif(current_setting('app.tenant_id', true), '')::uuid`, so a missing context yields no rows. Each table has a RESTRICTIVE policy `tenant_id = (select app.tenant_id())`, with PERMISSIVE policies on top: own rows, a team lead through `app.leads(employee_id)`, HR and administration everything in the tenant. A meta test walks all tables.
- Triggers: `audit.track()` on all `app` tables (actor from `app.user_id`), `app.reject_change()` on journals and `audit.log` (the sandbox purge is the only exception), `app.enforce_period_lock()` (date up to `closed_through` raises `ZT001`), `app.guard_request_status()`, `set_updated_at` on mutable master data.
- Money is `bigint` in whole cents. Rate and rounding grids are check-constrained (`1, 5, 6, 10, 15, 30, 60` minutes).

### Tables

Tenants, people and time:

- `tenants`: name, slug, state (16 federal states), timezone (checked to `Europe/Berlin`), holiday options, flextime cap settings, `carryover_until`, `kind` (`live` or `sandbox`), `workspace` (`company` or `solo`), `sandbox_group`, `expires_at` (set exactly for sandboxes).
- `users` (email unique across tenants, role, locale, status), `teams`, `team_leads`, `employees` (personnel number, entry and exit date, `closed_through`, writable only through the close trigger).
- `work_models`, `contracts` (history with valid-from, minutes per weekday copied in, vacation entitlement, cap override; no UPDATE, DELETE only for future unlocked rows).
- `time_entries`: `started_at`, `ended_at` (null while running), `end_reason`, `source`, `request_id`, `voided_at`. `check (ended_at > started_at)`, an `EXCLUDE USING gist` over `tstzrange` for non-voided rows and a partial unique index for one open time entry per person. The trigger allows two updates, each once from NULL: setting the end and voiding the entry. No DELETE. The clock time is the database's `now()`.
- `correction_requests`, `finding_acks`.

Absences, leave and flextime:

- `absence_requests` (vacation, sick, time off; an `EXCLUDE` over `daterange` for non-sick requests that are pending, approved or awaiting cancellation) and `absence_days` (portion, target-minute snapshot, vacation days, supersession).
- `vacation_ledger` (append-only, one bucket per entitlement year, signed `numeric(5,2)` days, `dedupe_key`), `vacation_notices` (append-only).
- `flex_bookings` and `month_closings` (both append-only). A close is allowed only for the month after `closed_through`, a reopen only for the last closed month. The trigger moves `closed_through` and posts the cap.

Auth and operations:

- `auth.credentials`, `auth.sessions` (SHA-256 token hash, CSRF hash, idle and absolute expiry), `auth.tokens` (invite and password reset), `auth.mfa_challenges`, `auth.webauthn_challenges`, `ops.rate_limits`, `ops.demo_outbox`.
- `audit.log` (append-only): time, actor, role, source (`trigger`, `app` or `cli`), action, table, row, subject person, column diff, request id, IP for application events. Employees can read their own entries (Art. 15 GDPR).

Projects and invoices:

- `clients`, `projects`, `tasks`, `project_members`, `rates` (valid-from, no UPDATE, DELETE only before they take effect), `project_entries` (own exclusion constraint and one running timer per person, frozen once an invoice holds the entry).
- `billing_profiles` (one row per tenant), `invoice_counters`, `invoices`, `invoice_lines`, `invoice_line_entries` (which project time entries went into which line, kept after a cancellation), `invoice_documents` (the stored original, append-only; its audit trigger records the row without the document content).
- An issued invoice is frozen except for its payment and cancellation fields. `retain_until` is generated as the end of the eighth year after the invoice year, and `guard_tenant_retention` blocks deleting a live tenant that still holds invoices within that period.

## Authentication

Live sign-in paths, all of them with a mandatory second factor:

1. **Passkey alone.** WebAuthn, discoverable credential, `userVerification: 'required'`. Gives a full session.
2. **E-mail and password.** Leads to an intermediate step (cookie `__Host-zeit_mfa`, 5 minutes, at most 5 attempts, only the hash stored in `auth.mfa_challenges`), then TOTP code, recovery code or passkey.
3. **Accepting an invitation.** The password is set, the session starts in an enrolment state in which only the enrolment routes answer (otherwise 403 `MFA_ENROLLMENT_REQUIRED`). Once a TOTP is confirmed or a passkey registered, the recovery codes are shown once.

Details:

- Passwords: argon2id via `@node-rs/argon2` with a pepper (`PASSWORD_PEPPER`, 32 bytes, used as the argon2 `secret`), at least m = 19 MiB, t = 2, p = 1, rehash on sign-in, 12 to 128 characters, checked against a list of common passwords. A dummy hash runs for unknown e-mails and the error message is the same.
- TOTP: RFC 6238 (SHA-1, 6 digits, 30 s, one step of tolerance), reuse prevented through `last_used_step`, 20-byte secret encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`, 32 bytes, with a `key_version` for rotation), QR code rendered server-side as SVG.
- Recovery codes: ten random codes, only their hash stored, single use. A new set needs a fresh confirmation.
- Passkeys through `@simplewebauthn`: RP ID is the host of `APP_ORIGIN`, `residentKey: 'required'`, `attestation: 'none'`. Challenges live server-side for 5 minutes and are single use.
- Sessions: 32 random bytes in `__Host-zeit_sid` (`Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`), only the SHA-256 in the database. 12 hours idle, 7 days absolute. A new session starts on sign-in, persona switch and password change. People can list and end their own sessions.
- CSRF: `application/json` only on writing requests, `Sec-Fetch-Site: same-origin` or else `Origin` equal to `APP_ORIGIN`, plus a synchronizer token from `GET /api/auth/session` in `X-CSRF-Token`, compared in constant time.
- Step-up: a confirmation from the last 10 minutes through `POST /auth/reauth` (password and TOTP, or a passkey), otherwise 403 `REAUTH_REQUIRED`. Required for password change, confirming or removing a factor (except the first), new recovery codes, any change to users, disabling and enabling users, resetting someone else's second factor, reopening a month, deleting a client, changing the billing profile, issuing and cancelling invoices. Skipped when `APP_MODE=demo`.
- Invitations: 32-byte token, only the hash stored, 7 days, single use, link `…/invite#t=<token>`. There is no sign-up endpoint. A password reset always answers the same way, the token lives 30 minutes, and all sessions end afterwards.
- Administration can reset another person's second factor (step-up, audit entry, mail to the person). Security mails go out for password change, TOTP on or off, passkey added or removed, new recovery codes and a reset.
- Rate limits: `@nestjs/throttler` globally, then per route and per e-mail, network or user. Persistent counters in `ops.rate_limits`, with exponential back-off on accounts.
- Headers: CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, Permissions-Policy, COOP and CORP. HSTS is set by the host's Caddy. `helmet` on the API, 100 kB body limit, no compression on `/api`.
- Encryption: TLS at Caddy, `__Host-` cookies only over HTTPS. At rest: passwords argon2id plus pepper, all tokens as SHA-256, TOTP secrets AES-256-GCM, backups encrypted with `age` before they leave the server. Secrets live only in the server's `.env` (mode 600), gitleaks runs in CI.

## HTTP API

Prefix `/api`, JSON, errors as `{ code, message, details }`. Roles form a hierarchy: employee, team lead, HR, administration, and every role may do what the ones below it may. `RolesGuard` checks the minimum role (403 `FORBIDDEN`), the service checks "own data" and "own team" through `assertCanSee`, and RLS sits behind both. `apps/api/test/security/role-matrix.int.spec.ts` lists every route with its minimum role and workspace and fails when a route is missing from the table.

Conventions:

- Lists use a cursor (`cursor`, `limit`, default 50, at most 200). Ranges are capped (62 days for entries, 366 days for requests, findings and invoices).
- A write into a closed month (time entries, absences, flextime postings, contracts) ends with 409 `PERIOD_LOCKED`.
- Project time inside an invoice draft or an invoice is frozen, changes end with 409 `INVOICED`.
- Routes marked "company" answer 404 in a solo workspace, through `WorkspaceGuard` with `@Workspace('company')`, the same reply as an unknown route.
- Sign-in routes marked "demo 404" do not exist with `APP_MODE=demo`, the `/demo` routes answer 404 in every other mode.
- Global rate limit 300 per minute and IP, stricter limits per route. "Per user" limits run in `UserRateLimitGuard` because the global throttler runs before the session. Over the limit: 429 `RATE_LIMITED` with `Retry-After`.
- Rendering (previews, time report PDFs, regenerating a missing document, the probe render before numbering) goes through one worker queue: 5 s per job, 2 at a time and 10 waiting per process, then 503 `RENDER_BUSY`. More than 50 pages gives 422 `PAGE_LIMIT`.
- Invoice limits: at most 500 lines and 5000 project time entries per invoice (400), and in a sandbox 2000 lines and 30 issued documents (409 `SANDBOX_QUOTA`).

Routes by module, with the minimum role. HR means HR and administration unless noted.

| Module            | Routes                                                                                                                                              | Access                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Operations        | `GET /health`, `GET /config`                                                                                                                        | public                                                                               |
| Auth              | `/auth/login`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/invitations/*`, `/auth/mfa/*`, `/auth/passkey/*`                             | public, demo 404, per-route limits                                                   |
| Session           | `/auth/session`, `/auth/logout`, `/auth/sessions`, `/auth/password/change`, `/auth/reauth*`, `/me`                                                  | everyone, own account                                                                |
| Sign-in methods   | `/security`, `/security/totp/*`, `/security/passkeys*`, `/security/recovery-codes`                                                                  | everyone, own account, step-up for most changes, last factor cannot be removed       |
| Clock             | `/clock`, `/clock/in`, `/clock/break`, `/clock/resume`, `/clock/out`                                                                                | everyone with a personnel record, own, company                                       |
| Times             | `/employees/:id/entries`, `/days`, `/flex`                                                                                                          | own, team lead for the led team, HR; company                                         |
| Corrections       | `/corrections` and `/:id/approve\|reject\|withdraw`                                                                                                 | own as a request for a second person, HR directly on other people's times; never own |
| Absences          | `/absences`, `/absences/preview`, `/:id/approve\|reject\|withdraw\|cancel\|confirm-sick-note`, `/team-calendar`                                     | own, team lead for the led team, HR; sick notes confirmed by HR only                 |
| Leave             | `/employees/:id/vacation`, `/vacation/adjustments`, `/vacation/notices`, `/me/vacation/notices/:id/acknowledge`                                     | own, team lead, HR; adjustments and notices HR                                       |
| Flextime          | `/employees/:id/flex/bookings`                                                                                                                      | HR, never own account                                                                |
| Compliance        | `/compliance/findings`, `/findings/ack`, `/rule-versions`                                                                                           | team lead for the led team, HR                                                       |
| Master data       | `/employees`, `/contracts`, `/work-models`, `/teams`, `/teams/:id/leads`                                                                            | HR; company                                                                          |
| Users             | `/users`, `/users/:id/invite\|disable\|enable\|mfa/reset`                                                                                           | administration, step-up for changes                                                  |
| Month-end close   | `/months/:month/checklist`, `/close`, `/reopen`                                                                                                     | HR; reopen administration with step-up, only the last closed month                   |
| Exports           | `/exports/timesheet`, `/exports/month-overview`, `/exports/time-report`                                                                             | timesheet own, team lead, HR; the others HR; CSV default                             |
| Project timer     | `/project-timer`, `/start`, `/stop`                                                                                                                 | everyone with a personnel record, own; a running timer ends in the same transaction  |
| Project time      | `/project-entries`, `/:id/void`, `/employees/:id/project-week`, `/project-time/summary`                                                             | own, HR for others; a corrected entry is voided, never deleted                       |
| Clients, projects | `/clients*`, `/projects*`, `/tasks/:id*`, `/rates*`                                                                                                 | HR; `/projects/bookable` for everyone; deleting a client administration with step-up |
| Billing           | `/billing/profile`, `/billing/unbilled`, `/billing/revenue`                                                                                         | HR; changing the profile administration with step-up                                 |
| Invoices          | `/invoices`, `/drafts`, `/:id`, `/refresh`, `/lines*`, `/preview.pdf`, `/issue`, `/cancel`, `/paid`, `/unpaid`, `/document`, `/xml`, `/time-report` | HR; issue and cancel with step-up                                                    |
| Tenant            | `/tenant`, `/holidays`                                                                                                                              | everyone read, administration write                                                  |
| Audit log         | `/audit`                                                                                                                                            | own entries, HR all                                                                  |
| Demo              | `/demo/sandboxes`, `/demo/personas`, `/demo/switch`, `/demo/outbox`                                                                                 | only with `APP_MODE=demo`                                                            |

## Domain package

`@zeit/rules` computes with Temporal and returns explanations as `{ key, params }`, never finished text.

- `calendar/`: `workdayOf`, `wholeMinutes` (the only source of minutes), `summarizeWorkday`, `gapsBetween`, `splitByLocalDate` (correct on 23- and 25-hour days), `monthDays`.
- `holidays/`: `easterSunday`, `holidaysFor(year, state, { optional, halfDays })` with the years each rule applies.
- `contracts/`: `contractOn`, `targetMinutes`. `flextime/`: `dayBalance`, `accountBalance`, `applyCap`.
- `arbzg/`: versioned `RULESETS`, `ruleSetFor(date)`, `groupShifts` (gaps under 3 hours belong to the shift, also across midnight), `checkShifts` returning findings `{ code, severity, date, ruleVersion, facts }`.
- `vacation/`: `annualEntitlement`, `daysForRange`, `allocate` (earliest deadline first), `expiryDecision` (no expiry without a notice), `sickRefund`. Exact fractions internally.
- `money/`, `billing/` (rounding per project, task and day, rate resolution, tax per rate group, mandatory details and blockers, § 19 check, budget) and `projects/` (project time against working time, timer notice from 12 hours).

Properties are tested with fast-check, see the test table in the README. Every rule with its source is in `docs/rules.md`.

## Web app

- TanStack Router (file-based, search params validated with zod), TanStack Query as the only holder of server state, react-hook-form with `zodResolver`, React Aria Components for dates and ranges, CSS Modules, no Tailwind.
- i18next with one JSON file per language and namespace, typed keys, parity checked in CI. Fixed English terms are in `docs/glossary.md`.
- Paths are English: `/`, `/time`, `/absences`, `/vacation`, `/inbox`, `/team/calendar`, `/projects`, `/team/projects`, `/billing/*`, `/hr/*`, `/admin/*`, `/print/timesheet/$id/$month`, `/login`, `/invite`, `/reset`. `/` shows the week view in a company and the project week matrix in a solo workspace.
- CSV is written server-side (UTF-8 with BOM, `;` in German). PDFs come from the browser's print view, except invoices and time reports, which pdfkit renders on the server because the issued original is stored and ZUGFeRD needs the PDF with embedded XML (ADR 0004).

## Operations details

- `zeit-api` is `node:24-slim`, multi-stage, user `node`, and contains migrations and dbmate (API, migration job and CLI use the same image). `zeit-web` is the Vite build in `caddy:2-alpine` on port 8080 with SPA fallback and `/api/*` proxied.
- Hardening: `read_only`, tmpfs, `cap_drop: ALL`, `no-new-privileges`, memory and PID limits, log rotation.
- Networks per Compose project: `edge` (host Caddy and web), `app` (web and API, pinned subnet used as `TRUSTED_PROXY`, `internal: true`), `db` (`internal: true`).
- Jobs (`@nestjs/schedule`, `Europe/Berlin`, behind `pg_try_advisory_lock`): sandbox purge every 15 minutes, cleanup hourly, opening the leave year on 1 January at 00:05, expiry check daily at 02:00. The leave jobs skip solo tenants.
- Mail: `ResendTransport` (live), `OutboxTransport` (demo), `MemoryTransport` (tests).
- CI jobs in `.github/workflows/ci.yml`: `static` (prettier, eslint, tsc, dependency-cruiser), `unit`, `migrate` (migrations up, rollback and up again, then the schema drift check against `schema.generated.ts`), `integration`, `einvoice` (KoSIT validator), `e2e` (Playwright against the built images), `coverage-rules`, `i18n` (de/en parity), `docker` (build and Trivy), `audit` (`pnpm audit --prod --audit-level high`), `gitleaks`, plus CodeQL in its own workflow `codeql.yml`. Actions are pinned by SHA with `permissions: contents: read`.
- Server addresses, keys and paths never go into the repository, only placeholders.

## Settled decisions

Product and scope:

- NestJS API, Vite and React SPA, PostgreSQL with its own sign-in, no hosted auth service.
- Two instances: live (invitation only) and demo (sample company, persona switch without a password). Interface in German and English.
- Target: small businesses with flextime. The sample company is a tax consultancy in North Rhine-Westphalia with an invented name.
- Corrections of other people's times by HR take effect immediately with a mandatory reason, an audit entry and a mail to the person. Corrections of one's own times need a second person.
- Nobody decides on their own requests. Team leads decide for their team, HR for everyone.
- Sick leave is a notice, not an approval. The refund of leave under § 9 BUrlG happens only after HR confirms the doctor's note.
- No automatic break deduction, the § 4 notice appears instead.
- Leave is exact to two decimals, the carry-over runs until 31 March automatically.
- Tenants are created only by the CLI in the API image. The month-end close applies per tenant.
- The demo sandbox lives 24 hours.
- Not in version 1: DATEV export, expiry during long-term sickness, dunning, multiple currencies, a template editor, project colours, incoming invoices.

Invoicing and project time:

- The project timer is separate from the clock, the comparison with working time is only a notice (ADR 0002).
- The solo workspace is a tenant with `workspace = 'solo'` and exactly one person, created only through `tenant:create --workspace solo`.
- An invoice is built from recorded time and can take free lines. The invoice language is set per client.
- HR and administration issue and cancel, both with step-up. Freelancers get in only by invitation.
- Amounts are whole cents, the number sequence is per tenant and year from a counter table (ADR 0003). PDFs come from pdfkit, e-invoices from `@e-invoice-eu/core`, validated in CI with the KoSIT validator (ADR 0004).

Code:

- Kysely with `pg`, dbmate for migrations as plain SQL, types from kysely-codegen (ADR 0001).
- Code and identifiers in English, no explanatory comments in production code. Prettier with tabs, single quotes, semicolons and a print width of 100. Containers never run as root.
