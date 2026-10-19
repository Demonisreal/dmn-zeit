[English version](README.md)

# dmn-zeit

[![CI](https://github.com/Demonisreal/dmn-zeit/actions/workflows/ci.yml/badge.svg)](https://github.com/Demonisreal/dmn-zeit/actions/workflows/ci.yml)

Arbeitszeit, Urlaub und Gleitzeit nach ArbZG und BUrlG für kleine Betriebe, dazu Projektzeiten und Rechnungen nach § 14 UStG mit E-Rechnung, bei denen jede Zahl zeigt, woraus sie entsteht.

![Wochenbuch im Musterbetrieb mit aufgeklapptem Tag: Buchungen, Rechnung Ist minus Soll und ein Befund nach § 5 ArbZG](docs/screenshot.jpg)

---

## Ausprobieren

**Demo: [zeit-demo.dmn-software.com](https://zeit-demo.dmn-software.com)**

Kein Konto, kein Passwort. Auf der Startseite **„Demo starten“** klicken (oben lässt sich zwischen Deutsch und Englisch wechseln). Das legt eine eigene Sandbox an: einen erfundenen Musterbetrieb (Steuerbüro in NRW, zwölf Personen in drei Teams, Buchungen seit Januar, offene Anträge, Befunde nach dem Arbeitszeitgesetz) und daneben den Solo-Bereich einer erfundenen Freelancerin mit Kunden, Projekten und Rechnungen. Die Demo startet in der Rolle Beschäftigte, über **„Rolle wechseln“** geht es ohne Passwort zu Teamleitung, Personalverwaltung, Administration und in den Solo-Bereich.

Was in der Demo anders ist als im echten Betrieb:

- Die Sandbox wird nach 24 Stunden mit allen Eingaben gelöscht, der Aufräumjob läuft alle 15 Minuten.
- E-Mails gehen nicht hinaus, sie landen im **Postausgang** (Link im Banner oben).
- Rechnungen tragen das Wasserzeichen „Musterrechnung – keine Rechnung im Sinne des § 14 UStG“ und eine Nummer mit `MUSTER-`. Das hängt am Mandantentyp `sandbox`, nicht an einem Schalter in der Konfiguration.
- Ausstellen und Stornieren verlangen sonst eine erneute Bestätigung mit Passwort und zweitem Faktor (Step-up). In der Demo entfällt sie, weil es dort keine Passwörter gibt.

Damit die Demo nicht leerläuft, sind Sandboxes begrenzt: drei je Stunde und zehn je Tag aus einem Netz (IPv4 je /24, IPv6 je /64), höchstens 60 neue je Stunde über alle Besucher und 300 gleichzeitig. Darüber sagt die Startseite „Von diesem Anschluss wurden in kurzer Zeit zu viele Demos gestartet.“ bzw. „Die Demo ist gerade voll.“ und nennt die Wartezeit. Jede Sandbox hat dazu Mengengrenzen je Tabelle, etwa 20.000 Buchungen oder 2.000 Rechnungspositionen.

Die Live-Instanz `zeit.dmn-software.com` ist nur auf Einladung erreichbar. Es gibt keine offene Registrierung, Firmen und Solo-Bereiche legt der Betreiber über die CLI an, und ein zweiter Faktor (Passkey oder TOTP) ist für jede Rolle Pflicht.

### Der Kern in zwei Minuten

1. **„Demo starten“.** Es öffnet sich das Wochenbuch einer Person in der Rolle Beschäftigte, die heute morgen eingestempelt hat. Oben stehen **Pause** und **Gehen**, darüber der Rundgang mit vier Schritten im Betrieb und einem im Solo-Bereich.
2. **Einen Tag mit rotem `§ 5` aufklappen** (Rundgang-Schritt „Ruhezeit nach § 5 im Wochenbuch finden“). Links die Buchungen mit Pausen, rechts die Rechnung Ist minus Soll mit dem Vertrag, aus dem das Soll stammt, darunter der Befund „Ruhezeit seit dem letzten Arbeitsende nur … Vorgeschrieben sind 11 Stunden.“ mit Regelversion. Die Zeiten sind je Sandbox zufällig.
3. **Anträge → „Neuer Antrag“**, Urlaub und Zeitraum wählen, **„Antrag stellen“**.
4. **„Rolle wechseln“ → Teamleitung**, im **Posteingang** den Antrag **„Genehmigen“**. Das Urlaubskonto bucht die Tage ab.
5. **„Rolle wechseln“ → Personalverwaltung**, unter **Personal → Monatsabschluss** den Vormonat öffnen. Die Checkliste zeigt, was blockiert (offene Anträge, Buchung ohne Gehen) und was nur Hinweis ist, dazu die Gleitzeit, die der Abschluss als Kappung bucht. Nach **„Monat abschließen“** sind Buchungen, Anträge und Verträge bis zum Monatsende gesperrt.
6. **„Rolle wechseln“ → Freelancer.** Die Startseite ist die Wochenmatrix Projekt × Tag, ein Projekt-Timer läuft. Darunter **„Nicht abgerechnet“** mit Beträgen je Kunde.
7. **Rechnungen**, den offenen Entwurf für die Agentur öffnen. Die **Vorschau** ist ein echtes PDF, aus demselben Renderer wie das spätere Original. **„Ausstellen“**, Format ZUGFeRD, **„Jetzt ausstellen“**: Die Rechnung bekommt die nächste Nummer und ist danach unveränderbar.
8. **„PDF herunterladen“** liefert ein PDF/A-3 mit eingebettetem XML. Eine Rechnung an die Stadtwerke ist als XRechnung ausgestellt, dort gibt es zusätzlich **„XML herunterladen“**.
9. **„Stornieren“** mit Grund (mindestens zehn Zeichen) → **„Stornorechnung ausstellen“**. Die Stornorechnung bekommt eine eigene Nummer, beide Rechnungen verweisen aufeinander.

Auch einen Blick wert: im **Postausgang** die Mail, die eine Korrektur der Personalverwaltung auslöst, und im Solo-Bereich in den Einstellungen **„Rechnungssteller“** das Steuerprofil auf Kleinunternehmer umschalten. Der offene Entwurf meldet dann das geänderte Steuerprofil, nach **„Zeiten neu einlesen“** zeigt seine Vorschau den Hinweis nach § 19, und die Umsatzprüfung rechnet vor, warum der Vorjahresumsatz die Befreiung ausschließt.

---

## Was drin ist

- **Stempeluhr und Wochenbuch** mit Tagesleiste, Gehen aus der Pause beendet den Tag am Pausenbeginn. Schichten über Mitternacht und Tage mit 23 oder 25 Stunden bei der Zeitumstellung rechnen richtig.
- **Prüfung nach ArbZG** als Hinweis, nicht als Sperre: § 3 (über 8 und über 10 Stunden), § 4 (Pausensumme, nur Pausen ab 15 Minuten zählen, mehr als 6 Stunden am Stück), § 5 (Ruhezeit unter 11 Stunden), § 9 (Sonn- und Feiertage). Die Regeln sind versioniert, eine Reform wird ein neuer Eintrag.
- **Korrekturen nur als Antrag mit Begründung.** Niemand genehmigt die eigenen. Die Personalverwaltung korrigiert fremde Zeiten sofort, mit Pflichtgrund, Protokolleintrag und Mail an die Person.
- **Urlaub nach BUrlG:** Wartezeit, Teilurlaub und Zwölftelung, gesetzlicher Mindesturlaub, Übertrag bis 31.3., Verfall nur nach dokumentiertem Hinweis (BAG 9 AZR 541/15), Rückbuchung bei Krankheit im Urlaub erst nach bestätigtem Attest.
- **Gleitzeitkonto** mit Kappung je Vertrag oder Betrieb, Zeitausgleich als Abwesenheitsart, Teamkalender.
- **Feiertage aller 16 Bundesländer** mit Gültigkeitsjahren, etwa Frauentag in Berlin ab 2019.
- **Monatsabschluss** mit Checkliste, Schnappschuss und Sperre, danach Stundenzettel und Monatsübersicht als CSV.
- **Projektzeit** mit eigenem Timer neben der Stempeluhr, Nachträge mit Pflichtnotiz, Wochenmatrix Projekt × Tag. Sätze mit Gültigkeitsdatum je Kunde, Projekt, Aufgabe oder Person, Rundung je Projekt, Aufgabe und Tag, Budget mit Warnung.
- **Solo-Bereich** für Freelancer: eigener Mandantentyp mit genau einer Person, ohne Stempeluhr, Urlaub und Personal.
- **Rechnungen nach § 14 UStG** aus erfassten Zeiten plus freien Positionen, PDF nach DIN 5008. Regelbesteuerung, Kleinunternehmer nach § 19, Reverse Charge für EU-Unternehmer, Drittland, Kleinbetragsrechnung bis 250 €. Pflichtangaben werden vor der Nummer geprüft, Rechnungssprache Deutsch oder Englisch je Kunde, Zahlungsstatus, Löschschutz während der Aufbewahrung.
- **E-Rechnung:** XRechnung (CII) und ZUGFeRD EN 16931 als PDF/A-3. Vorgabe je Kunde, das XML wird im Original gespeichert.
- **Stundennachweis** je Kunde und Zeitraum oder je Rechnung, als PDF oder CSV.
- **Anmeldung** ohne Drittanbieter: argon2id mit Pepper, Passkeys, TOTP, Wiederherstellungscodes, Step-up für heikle Aktionen.
- **Oberfläche Deutsch und Englisch** mit gleichem Inhalt, Fachbegriffe mit fester Übersetzung (`docs/glossary.md`).

## Was bewusst nicht drin ist

- **GPS, Hardware-Terminals, Schichtplanung.** Die Zielgruppe sind Büros, Dienstleister und Verwaltungen mit Gleitzeit, die im Browser oder am Handy stempeln.
- **KI-Funktionen.** Bewusst weggelassen. Die Fachlogik ist deterministischer Code, jede Regel steht mit Paragraf und Quelle in `docs/rules.md`.
- **Automatischer Pausenabzug.** Gebucht wird, was gestempelt ist. Fehlt eine Pause, kommt der Hinweis nach § 4.
- **Ausnahmen der §§ 10–11 ArbZG** (Gesundheitswesen, Gastronomie, Notdienste). Sonntags- und Feiertagsarbeit ergibt deshalb immer eine Warnung.
- **Verfall bei Langzeiterkrankung** (15-Monats-Frist). Die Oberfläche benennt die Grenze, gerechnet wird sie in Version 1 nicht.
- **Mahnwesen, Mehrwährung, Vorlagen-Editor, Eingangsrechnungen.** Nicht in Version 1. Alle Beträge sind Euro in ganzen Cent.
- **Inländisches Reverse Charge nach § 13b Abs. 2 UStG und OSS.** Solche Umsätze behandelt die Software als regulär in Deutschland steuerpflichtig. Ob die Zielgruppe sie hat, steht als offene Frage für die Steuerberatung in `docs/rechnungen-recht.md`.
- **Stundennachweis als Anlage der E-Rechnung.** Mit Anlage würde das Rendern die Grenze von 5 s im Worker sprengen, und die Bibliothek schreibt Anhänge zusätzlich als Base64 ins XML. Der Nachweis wird bei jedem Abruf aus der eingefrorenen Zuordnung gerendert.
- **DATEV-Export.** Späterer Ausbau.

---

## Architektur

```
Browser
  │
  ▼
zeit-web   Caddy, SPA statisch, CSP, zstd/gzip außer /api
  │  /api/*
  ▼
zeit-api   NestJS
  │   Guards: Throttler → Session → CSRF → 2FA-Einrichtung → Bereich → Rolle → Step-up
  │   Module: time, corrections, absences, vacation, flex, compliance, months, exports,
  │           projects, billing, invoices, documents, demo, auth, org
  │
  ├── withTenant(session, trx => …)
  │     set_config('app.tenant_id' …, true) je Transaktion
  │           ▼
  │     PostgreSQL 17
  │       zeit_app     Laufzeitrolle, NOBYPASSRLS, nur DML
  │       RLS          ENABLE + FORCE, restriktiv je Mandant
  │       Trigger      append-only Journale, Monatssperre, audit.track()
  │       zeit_system  SECURITY DEFINER, search_path = ''
  │                    (Anmeldung, Nummernvergabe, Sandbox-Purge)
  │
  ├── worker_threads   pdfkit, @e-invoice-eu/core
  │                    5 s, 128 MB, 2 gleichzeitig, 10 wartend
  │
  └── Mail             Resend (Live) | Postausgang (Demo)

packages/rules      Fachlogik ohne I/O und ohne Uhr, „jetzt“ ist ein Parameter
packages/shared     zod-Verträge für API und SPA
packages/demo-data  deterministischer Generator für Musterbetrieb und Solo-Welt
```

Die SPA rechnet Vorschauen mit denselben Funktionen aus `@zeit/rules`, maßgeblich bleibt der Server. Ein großer Teil der Regeln steht in PostgreSQL selbst: Überlappungen verhindert ein `EXCLUDE USING gist` über `tstzrange`, Journale lassen keine Änderung zu, ein Trigger sperrt abgeschlossene Monate. Die API übersetzt die Fehlercodes der Datenbank direkt (`23P01` → `TIME_OVERLAP`, `ZT001` → `PERIOD_LOCKED`). Deshalb Kysely statt ORM: Policies, Constraints und Trigger lassen sich in keinem ORM-Schema vollständig beschreiben, es gäbe zwei Quellen (ADR 0001).

**Stack:** Node.js 24, pnpm-Workspace, NestJS 11, Kysely mit `pg`, dbmate, PostgreSQL 17, zod, `@node-rs/argon2`, `@simplewebauthn/server`, pdfkit, `@e-invoice-eu/core`, Vite 8, React 19, TanStack Router und Query, React Aria Components, i18next, CSS Modules, Vitest, Testcontainers, Playwright.

Aufbau des Repositorys, Datenmodell, Anmeldung und Routenübersicht stehen in [`docs/architecture.md`](docs/architecture.md) (auf Englisch). Die fachlichen und rechtlichen Dokumente in `docs/` (`rules.md`, `glossary.md`, `rechnungen-recht.md`, Bedrohungsmodell) sind deutsch.

---

## Entscheidungen

### 1. Rechnungsnummern aus einer Zähler-Tabelle, nicht aus einer Sequenz

Eine Rechnungsnummer muss fortlaufend und einmalig sein. Eine PostgreSQL-Sequenz ist dafür ungeeignet: `nextval` ist nicht transaktional, jeder Rollback reißt eine Lücke.

Vergeben wird deshalb nur in der Definer-Funktion `app.issue_invoice` per Upsert auf `app.invoice_counters (tenant_id, year, last_seq)`. Der Upsert sperrt die Zeile bis zum Commit, auch beim ersten Beleg eines Jahres. Die Laufzeitrolle darf den Zähler nur lesen und hat kein Spalten-Grant auf Nummer und Ausstellungsdatum. Wegen `check ((status = 'draft') = (number is null))` scheitert auch ein direktes `update … set status = 'issued'`.

Geprüft mit 20 parallelen Ausstellungen, die 1 bis 20 ohne Doppel ergeben, einem Rollback, der seine Nummer der nächsten Ausstellung zurückgibt, und einem Entwurf, der aus zwei Verbindungen gleichzeitig ausgestellt wird und genau eine Nummer verbraucht. Der Preis: Ausstellungen desselben Mandanten laufen nacheinander (ADR 0003).

### 2. Erst Probe-Rendering, dann die Nummer

Gerendert wird das Original nach dem Commit im Worker, allein aus den Schnappschüssen der Rechnung. Scheitert dort etwas, steht eine nummerierte Rechnung ohne Dokument da. Eine frühere Fassung hatte genau diese Lücke: Die Vorprüfung renderte nur das PDF, scheiterte danach die E-Rechnung, war die Nummer schon vergeben.

Jetzt rendert `POST /invoices/:id/issue` den Entwurf vorher einmal im gewählten Format, bei ZUGFeRD das PDF/A-3 mit XML, bei XRechnung zusätzlich das XML. Über 50 Seiten ergibt 422, eine volle Warteschlange 503, beides ohne Nummer. Auch die Pflichtangaben der E-Rechnung (`einvoiceBlockers`) laufen vor der Vergabe. Der Test „takes no number when the e-invoice of the chosen format fails to render“ hält das fest.

### 3. Die Steuerbehandlung wird beim Ausstellen in SQL nachgerechnet

Ob Regelbesteuerung, Reverse Charge, Drittland oder § 19 gilt, leitet sich aus dem Abrechnungsprofil und dem Kunden ab (Land, Unternehmer, USt-IdNr.). Der Entwurf speichert das Ergebnis beim Anlegen. Befund aus dem Security-Review: Änderte sich danach der Kunde, ging die Rechnung mit der alten Behandlung hinaus.

Jetzt meldet der Entwurf `tax_treatment_stale` bzw. `tax_profile_changed`, „Zeiten neu einlesen“ leitet beides neu ab. `app.issue_invoice` prüft dieselbe Regel noch einmal in SQL über `app.expected_tax_treatment` und weist einen veralteten Entwurf ab, `app.hold_invoice_basis` sperrt Kunde und Profil während des Ausstellens. Reverse Charge verlangt in der E-Rechnung die USt-IdNr. des Käufers (BR-AE-02).

### 4. Nichts wird überschrieben

Buchungen kennen genau zwei Updates, je einmal von NULL: das Ende und die Stornierung. Kein DELETE, die Stempelzeit ist `now()` der Datenbank, eine Zeit vom Client wird abgewiesen. Urlaubskonto, Gleitzeitbuchungen, Monatsabschlüsse und Hinweise zum Urlaubsverfall sind append-only, ein Trigger lehnt jede Änderung ab. Eine Korrektur setzt die alte Buchung auf `voided` und legt eine neue mit Verweis auf den Antrag an, in einer Transaktion. Jede Änderung schreibt `audit.track()` mit Spalten-Diff, Akteur und betroffener Person ins Protokoll, Beschäftigte lesen ihre eigenen Einträge (Art. 15 DSGVO).

Für ausgestellte Rechnungen gilt dasselbe: Jedes Fachfeld ist eingefroren, auch für die Personalverwaltung, nur der Zahlungsstatus bewegt sich noch. Aufgehoben wird eine Rechnung allein durch eine Stornorechnung.

### 5. RLS als zweite Linie, nicht als einzige

Die API prüft Rolle und Zuständigkeit selbst (`RolesGuard`, danach `assertCanSee` im Service). Dahinter steht RLS mit `FORCE`, damit auch der Tabellenbesitzer nichts sieht, und je Tabelle eine restriktive Policy auf den Mandanten. Fehlt der Kontext, kommt keine Zeile. Die Werte setzt `set_config(…, true)` je Transaktion, damit nichts im Pool hängen bleibt.

Was Mandantengrenzen überschreiten muss (Anmeldung vor der Sitzung, Nummernvergabe, Sandbox-Purge), läuft über `SECURITY DEFINER`-Funktionen der Rolle `zeit_system` mit leerem `search_path`. Ein Meta-Test findet jede Tabelle mit `tenant_id` und prüft, dass sie erzwungen und restriktiv eingezäunt ist.

### 6. Projekt-Timer getrennt von der Stempeluhr

Die Stempeluhr ist die Arbeitszeitaufzeichnung nach § 16 Abs. 2 ArbZG: Antrag für jede Korrektur, Monatssperre, ArbZG-Prüfung. Projektzeit muss bis zur Abrechnung frei korrigierbar bleiben. Als Aufteilung der Stempelzeit hätte jede Korrektur für die Rechnung die Arbeitszeitaufzeichnung berührt, und im Solo-Bereich gäbe es nichts aufzuteilen.

Also zwei Uhren. Projektzeit sperrt nicht der Monatsabschluss, sondern der Entwurf oder die Rechnung, in der sie steht (409 `INVOICED`). Der Abgleich mit der Arbeitszeit ist ein Hinweis mit 5 Minuten Toleranz, keine Sperre. Ein Timer über 12 Stunden blockiert das Ausstellen, bis jemand die Zeit bestätigt (ADR 0002).

### 7. Die Stornorechnung hat im PDF ein anderes Vorzeichen als im XML

Im PDF liest sich die Stornorechnung als Gegenbuchung mit negativen Beträgen, ohne Zahlungsziel, Bankverbindung und Verzugshinweis. Im XML geht sie als Belegart 381 mit positiven Beträgen und Zahlungsart 97 (Verrechnung). 380 mit negativen Beträgen besteht den KoSIT-Validator zwar auch, viele Empfänger buchen eine 380 aber als Forderung. Beide Dokumente nennen das Original mit demselben Satz („storniert Rechnung … vom …“).

Damit PDF und XML nicht auseinanderlaufen, kommen alle Hinweistexte aus `einvoice/texts.ts`, und `text-parity.spec.ts` vergleicht beide je Fall. Ob die Vorzeichen für den Empfänger unschädlich sind, steht als offene Frage für die Steuerberatung in `docs/rechnungen-recht.md` (ADR 0004).

---

## Lokal starten

Voraussetzungen: Node.js ≥ 24, pnpm 11 (über corepack), Docker.

```bash
pnpm install
cp .env.example .env    # APP_MODE=demo, ohne Pepper und Schlüssel nimmt die API Entwicklungswerte
pnpm db:up              # Postgres 17 auf 127.0.0.1:54330
pnpm db:migrate         # Migrationen mit dbmate im Container
pnpm dev                # baut packages/*, startet API (:3001) und SPA (:5173)
```

Mit `APP_MODE=demo` zeigt `http://localhost:5173` die Startseite mit „Demo starten“. Für Mandanten im Live-Modus legt `tenant:create` aus der CLI im API-Image Firma und erste Administration an und gibt einen Einladungslink aus (siehe `deploy/README.md`).

**Ohne API und Datenbank:** `VITE_MSW=on pnpm --filter @zeit/web dev` startet nur die SPA mit Mock Service Worker. So ist auch der Screenshot oben entstanden.

Weitere Skripte: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm db:rollback`, `pnpm db:new`, `pnpm db:codegen` (Kysely-Typen aus der migrierten Datenbank).

## Tests

```bash
pnpm test                               # Unit, alle Pakete
pnpm --filter @zeit/api test:int        # Integration gegen Postgres aus Testcontainers
pnpm e2e:up && pnpm --filter @zeit/e2e test && pnpm e2e:down   # Playwright gegen gebaute Images
sh apps/api/test/einvoice/kosit.sh      # XML gegen den KoSIT-Validator
sh apps/api/test/einvoice/verapdf.sh    # PDF/A-3b mit veraPDF
```

Stand 02.10.2026: Unit 1703 (rules 608, shared 215, demo-data 144, api 432, web 304), Integration 1000, E2E 20 (Desktop und Mobil), KoSIT 16 von 16 Dateien `acceptable`, veraPDF 7 von 7 bestanden. Integration, E2E, KoSIT und veraPDF brauchen Docker. `@zeit/rules` hat eine Coverage-Schwelle von 95 %.

Schwerpunkt sind Stellen, die **still** falsch sein können:

| Datei                                                | Prüft                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/security/role-matrix.int.spec.ts`     | Liest jede registrierte Route per Reflection aus Nest und vergleicht sie mit einer Tabelle Route → Mindestrolle und Route → Bereich. Eine neue Route ohne Zeile, eine Zeile ohne Route oder eine abweichende Rolle lässt den Test scheitern                                             |
| `apps/api/test/db/rls.int.spec.ts`                   | Jede Tabelle mit `tenant_id` ist bekannt, mit `FORCE` und restriktiv eingezäunt. Ohne Kontext gibt es keine Zeile, auch nicht für den Besitzer                                                                                                                                          |
| `apps/api/test/db/invoices.int.spec.ts`              | 20 parallele Ausstellungen ergeben 1 bis 20 genau einmal, ein Rollback gibt seine Nummer zurück, eingefrorene Felder bleiben auch für HR gesperrt                                                                                                                                       |
| `apps/api/test/db/invoice-hardening.int.spec.ts`     | Derselbe Entwurf aus zwei Verbindungen verbraucht genau eine Nummer, 5000 Buchungen gehen, die 5001. wird ohne Nummer abgewiesen, Stornorechnungen sind nie bezahlt                                                                                                                     |
| `apps/api/test/invoices/einvoice.int.spec.ts`        | Scheitert die E-Rechnung im gewählten Format beim Probe-Rendering, wird keine Nummer vergeben                                                                                                                                                                                           |
| `apps/api/test/einvoice/golden.spec.ts` + `kosit.sh` | XRechnung und Factur-X für acht Fälle (19 %, 7 %, gemischt, Leitweg-ID, Reverse Charge, Drittland, Kleinunternehmer, Storno) gleich den Golden-Dateien, die der KoSIT-Validator in CI prüft. Eine geänderte Abbildung muss erneut durch den Validator                                   |
| `apps/api/test/einvoice/text-parity.spec.ts`         | Jeder Rechtshinweis aus dem PDF steht im XML und umgekehrt, kein § 13b UStG bei EU-Unternehmern, gleiches Datumsformat, Stornorechnung negativ im PDF und als 381 positiv im XML                                                                                                        |
| `apps/api/test/einvoice/verapdf.sh`                  | PDF/A-3b mit veraPDF, darunter ein PDF mit `&` und `<` im Firmennamen. Ein unmaskiertes `&` im XMP-Paket machte das PDF/A ungültig                                                                                                                                                      |
| `apps/api/test/exports/time-report.int.spec.ts`      | Stundennachweis als CSV byte-genau gegen Golden-Dateien (de, en), mit BOM und CRLF.                                                                                                                                                                                                     |
| `apps/api/test/documents/run-in-thread.spec.ts`      | Ein Render-Worker mit Endlosschleife wird nach dem Timeout beendet, einer mit Speicherhunger stirbt an seinem eigenen Heap-Limit von 16 MB                                                                                                                                              |
| `apps/api/test/demo/sandboxes.int.spec.ts`           | Die vierte Sandbox in der Stunde und die elfte am Tag werden abgewiesen, bis das Fenster endet, ein anderes Netz bleibt unberührt, die 61. neue Sandbox einer Stunde wartet für alle, Typ und Ablauf kommen nie vom Aufrufer                                                            |
| `apps/api/test/demo/timing.int.spec.ts`              | Ein vorbereiteter Plan wird im Median in unter 1,5 s geschrieben                                                                                                                                                                                                                        |
| `packages/rules/src/**/*.spec.ts`                    | Property-based mit fast-check: Ostern immer zwischen 22.3. und 25.4., mehr Arbeit entfernt nie einen § 3-Befund, längere Pause fügt nie einen § 4-Befund hinzu, Aufteilung summiert auch am 29.03. und 25.10. zur Gesamtdauer, die Stornorechnung ist die exakte Negation des Originals |
| `tests/e2e/src/tests/solo-invoice.spec.ts`           | Timer, Matrix, Entwurf aus Zeiten, Ausstellen mit Step-up, PDF-Download und Storno gegen die gebauten Images, dazu bis zur geladenen Vorschau keine CSP-Meldung in der Konsole und genau ein Abruf der Vorschau                                                                         |
| `tests/e2e/src/tests/accessibility.spec.ts`          | axe-Scan der Hauptseiten ohne Befund                                                                                                                                                                                                                                                    |

Zwei Befunde steckten nicht in der App, sondern in der Testumgebung:

**pdf-parse las ein fremdes PDF.** Das darin gebündelte pdf.js 1.10 ignoriert den `byteOffset` eines Buffers. Kleine Buffer teilt Node aus einem gemeinsamen Pool, pdf.js las also ab dem Anfang des Pools, mal ein anderes PDF, mal brach es mit „bad XRef entry“ ab. Die Tests geben jetzt eine eigene Kopie weiter.

**TOTP-Codes gelten je 30-Sekunden-Schritt nur einmal.** Das ist gewollter Schutz gegen Wiederverwendung (`last_used_step`), ließ aber parallele E2E-Anmeldungen derselben Person scheitern. Die Personas melden sich jetzt einmal im Global-Setup an, die Tests übernehmen das Session-Cookie.

## Sicherheit

- Passwörter mit argon2id und Pepper, Rehash beim Login, eine generische Fehlermeldung auch bei unbekannter E-Mail. Im Live-System ist ein zweiter Faktor Pflicht, TOTP-Geheimnisse liegen mit AES-256-GCM verschlüsselt in der Datenbank.
- Sitzung im Cookie `__Host-zeit_sid` (`Secure`, `HttpOnly`, `SameSite=Strict`), in der Datenbank nur als SHA-256. Alle Tokens nur als Hash.
- CSRF über Synchronizer-Token, `Sec-Fetch-Site` bzw. `Origin` und nur `application/json` bei schreibenden Requests.
- Rate-Limits global und je Route, je E-Mail, je Netz oder je Nutzer, persistent in `ops.rate_limits`. IPs aus der Demo nur gehasht mit Tagessalz.
- CSP ohne `unsafe-inline`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`. `sql.raw` verbietet ESLint.
- Bedrohungsmodell für den Rechnungsteil mit Befunden und Nachweis je Test in `docs/bedrohungsmodell-rechnungen.md`, Meldeweg in [`SECURITY.md`](SECURITY.md).

## Deployment

Zwei getrennte Compose-Projekte auf einem Server, `deploy/demo` und `deploy/live`, mit eigenem Postgres, eigenem Migrationsdienst (`dbmate --wait up`, die API startet erst danach) und eigenen Netzen. Container laufen nie als root, mit `read_only`, `cap_drop: ALL` und Speicherlimits. Davor steht der zentrale Caddy des Servers, ohne Cloudflare. Backups nur von Live, mit `age` verschlüsselt, bevor sie per `rclone` außer Haus gehen. Anleitung in [`deploy/README.md`](deploy/README.md).

Beide Instanzen laufen dort seit dem 2. Oktober 2026. Was die Läufe gegen die gebauten Images und die Reviews vorher gezeigt haben und jetzt im Code steht:

**Kein Heap-Flag für die API.** Ein `--max-old-space-size`, auch geerbt über `NODE_OPTIONS`, gilt für den ganzen Prozess und ersetzt die `resourceLimits` der Render-Worker. Gemessen: Aus 16 MB Worker-Limit wurden 8 GB. Den Speicher der API begrenzt allein `mem_limit` in Compose, die Testprozesse setzen das Flag zurück.

**Die PDF-Vorschau brauchte `frame-src blob:`.** Die Vorschau lädt das PDF als Blob in ein iframe, die strikte CSP blockte das. Dazu hängte react-aria ein `<style>` für `touch-action` ein, das `style-src 'self'` verweigerte. Die Regel steht jetzt in `base.css`, ein Platzhalter verhindert das Einhängen. Der E2E-Test schlägt fehl, sobald bis zur geladenen Vorschau eine CSP-Meldung in der Konsole steht.

**Demo und Live haben getrennte Edge-Netze.** Bei einem gemeinsamen Netz sähe jede Instanz die Rate-Limit-Herkunft der anderen. Das Netz `app` zwischen Web und API ist in beiden Instanzen zusätzlich `internal: true`.

**`/api` bleibt unkomprimiert.** In den Antworten stehen CSRF-Token und Wiederherstellungscodes, Kompression würde BREACH öffnen.

**Der CLI-Dienst hat kein Internet.** Die Hinweis-Mail beim Zurücksetzen eines zweiten Faktors geht deshalb nicht hinaus, die Konsole gibt den Link aus.

## Als Nächstes

- **veraPDF als CI-Job**, bisher nur lokal
- **E2E in Firefox und WebKit**, bisher nur Chromium
- **Antworten der Steuerberatung** zu Steuerrundung je Satzgruppe, Texten für EU-B2B und Drittland, Befreiungsnormen und Vorzeichen der Stornorechnung einarbeiten
- **Rechnungen im Musterbetrieb** fachlich klären: Ein Steuerbüro rechnet nach StBVV ab, nicht nach Stundensatz
- **DATEV-Export**

## Lizenz

Alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Das Repository ist zum Ansehen da, Nutzung, Vervielfältigung und Weitergabe nur mit schriftlicher Erlaubnis.
