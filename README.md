# dmn-zeit

Arbeitszeiterfassung, Urlaubsverwaltung und Gleitzeitkonto nach deutschem Arbeitsrecht.
Erfasste Zeiten werden gegen das Arbeitszeitgesetz geprüft, Urlaubsansprüche nach dem
Bundesurlaubsgesetz berechnet, Überstunden über ein Gleitzeitkonto geführt und abgebaut.
Korrekturen an bereits gebuchten Zeiten laufen immer über einen begründeten Antrag, keine
Buchung wird überschrieben.

Portfolio-Projekt unter der Marke DMN/Software. Kein Start/Stop-Timer ohne Kontext, sondern
nachvollziehbare Regeln: Pausen nach § 4 ArbZG, Höchstarbeitszeit nach § 3, Ruhezeit nach § 5,
Verfall von Resturlaub nur nach dokumentiertem Hinweis, Feiertage je Bundesland.

## Instanzen

Zwei getrennte Instanzen aus derselben Codebasis:

- **Demo** — Musterbetrieb mit erfundenen Beispieldaten, Wechsel zwischen den Rollen ohne
  Passwort, Daten werden regelmäßig zurückgesetzt.
- **Live** — echter Betrieb, nur auf Einladung. Es gibt keine offene Registrierung.

Details zu Aufbau, Ersteinrichtung und Rollback der beiden Instanzen stehen in
[`deploy/README.md`](deploy/README.md).

## Architektur

- **API** — NestJS mit TypeScript, eigene Anmeldung (argon2id, Sitzungen, Rollen), keine
  Drittanbieter-Auth.
- **Datenbank** — PostgreSQL, Mandantentrennung über Row Level Security, Migrationen mit
  dbmate.
- **Oberfläche** — Vite + React als statische SPA, ausgeliefert über Caddy.
- **Betrieb** — Docker Compose, jede Instanz mit eigenem Postgres, eigenem Migrationsdienst
  und eigenem Netz. Details in [`docs/planung.md`](docs/planung.md).

## Stack

Node.js 24, pnpm-Workspace mit `apps/api`, `apps/web`, `packages/shared`, `packages/rules`,
`packages/demo-data`. API: NestJS, Kysely, Zod, `@node-rs/argon2`, `@simplewebauthn/server`,
Pino. Web: React 19, TanStack Router/Query, React Aria Components, i18next, Zod.

## Entwicklung

```
pnpm install
pnpm db:up           # Postgres-Container starten
pnpm db:migrate      # Migrationen anwenden
pnpm dev             # API und SPA parallel
```

Weitere Skripte aus der Wurzel-`package.json`: `pnpm build`, `pnpm test`, `pnpm lint`,
`pnpm typecheck`, `pnpm format`, `pnpm db:rollback`, `pnpm db:new`.

## Tests

- **Unit** — `pnpm test` baut zuerst `packages/*` und läuft dann rekursiv über alle
  Workspaces (Vitest).
- **Integration** — `pnpm --filter @zeit/api test:int` gegen einen per Testcontainers
  gestarteten Postgres, benötigt einen laufenden Docker-Daemon.
- **End-to-End** — `compose.test.yml` baut API- und Web-Image und startet den vollen Stack
  (Postgres, Migration, API, Web) für Playwright-Läufe gegen den veröffentlichten Web-Port.

## Sicherheit

- Passwörter mit argon2id, Rehash beim Login, generische Fehlermeldung bei unbekannter
  E-Mail.
- Sitzungen über ein `Secure`/`HttpOnly`/`SameSite=Strict`-Cookie, in der Datenbank nur als
  SHA-256-Hash.
- CSRF-Schutz über Synchronizer-Token und Origin-Prüfung bei jedem schreibenden Request.
- Rate-Limits je Route (Login, Passwort-Reset, Demo-Sandbox) zusätzlich zu einem globalen
  Limit.
- Content-Security-Policy, `nosniff`, `Referrer-Policy: no-referrer` und weitere
  Sicherheits-Header auf API und Web.
- Details und Meldeweg für Schwachstellen stehen in [`SECURITY.md`](SECURITY.md).

## Lizenz

Siehe [`LICENSE`](LICENSE). Alle Rechte vorbehalten.
