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

- **Demo** — eigene Sandbox je Besuch mit zwei Welten aus erfundenen Beispieldaten: einem
  Musterbetrieb und einem Freelancer im Solo-Bereich. Wechsel zwischen den Rollen und zwischen
  beiden Welten ohne Passwort. Rechnungen aus der Sandbox tragen das Wasserzeichen
  "Musterrechnung – keine Rechnung im Sinne des § 14 UStG" und eine Nummer mit `MUSTER-`. Beide
  Welten bringen Musterrechnungen mit, der Solo-Bereich auch eine Stornorechnung und einen offenen
  Entwurf. Ein Rundgang führt durch Urlaubsantrag, Genehmigung, Monatsabschluss und das Ausstellen
  einer Rechnung. Eine Sandbox wird nach 24 Stunden gelöscht.
- **Live** — echter Betrieb, nur auf Einladung. Es gibt keine offene Registrierung.

Details zu Aufbau, Ersteinrichtung und Rollback der beiden Instanzen stehen in
[`deploy/README.md`](deploy/README.md).

## Funktionsumfang

- **Arbeitszeit** — Stempeluhr und Wochenbuch, Prüfung nach ArbZG, Korrekturen per begründetem
  Antrag, Monatsabschluss mit Sperre und Exporten. Gehen aus der Pause beendet den Tag am
  Pausenbeginn.
- **Urlaub und Gleitzeit** — Anspruch nach BUrlG mit Übertrag und Verfall nach Hinweis,
  Abwesenheiten mit Genehmigung, Teamkalender, Gleitzeitkonto mit Kappung.
- **Projektzeit** — eigener Projekt-Timer neben der Stempeluhr, Nachträge mit Notiz, Wochenmatrix
  Projekt × Tag mit Herleitung jeder Zahl. Im Betrieb ein Abgleich mit der Arbeitszeit als Hinweis.
- **Solo-Bereich** — eigener Mandant für eine freiberufliche Person, nur auf Einladung. Startseite
  ist die Wochenmatrix, Projekt-Timer statt Stempeluhr, Personalfunktionen sind ausgeblendet.
  Kunden, Projekte, Sätze und Rechnungen wie im Betrieb.
- **Kunden, Projekte, Stundensätze** — Aufgaben, Sätze mit Gültigkeitsdatum je Kunde, Projekt,
  Aufgabe oder Person, Rundung je Projekt, Aufgabe und Tag, Budget je Projekt mit Warnung.
- **Rechnungen** — nach § 14 UStG aus erfassten Zeiten, freie Positionen ergänzbar, PDF nach
  DIN 5008 mit Vorschau im Editor. Regelbesteuerung, Kleinunternehmer nach § 19 UStG, Reverse
  Charge und Drittland, die steuerliche Behandlung leitet sich aus Profil und Kunde ab.
  Pflichtangaben werden vor der Nummernvergabe geprüft, Ausstellen und Storno nur mit erneuter
  Bestätigung (im Betrieb durch Personalverwaltung oder Administration). Nummernkreis je Jahr,
  nach dem Ausstellen unveränderbar, Storno über eine Stornorechnung mit Verweis in beide
  Richtungen, Zahlungsstatus, Löschschutz während der Aufbewahrungsfrist. Rechnungssprache je
  Kunde, Deutsch oder Englisch.
- **E-Rechnung** — XRechnung (CII) als reines XML und ZUGFeRD EN 16931 als PDF/A-3 mit
  eingebettetem XML. Vorgabe je Kunde: XRechnung bei öffentlichen Auftraggebern mit Leitweg-ID,
  an Verbraucher nur PDF, sonst ZUGFeRD; am Kunden und beim Ausstellen änderbar. Das XML wird im
  Original aufbewahrt, bei XRechnung als eigene Datei zum Download. Geprüft mit dem
  KoSIT-Validator (in CI) und veraPDF (lokal).
- **Stundennachweis** — Projektzeiten je Kunde und Zeitraum oder je Rechnung, als PDF oder CSV.

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
- **E-Rechnung** — `apps/api/test/einvoice/kosit.sh` prüft die XML-Golden-Files mit dem
  KoSIT-Validator (XRechnung-Konfiguration), `apps/api/test/einvoice/verapdf.sh` die PDF/A-3b-Ausgabe
  mit veraPDF. Beide benötigen Docker.

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
