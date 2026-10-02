# Bedrohungsmodell: Projekte, Solo-Bereich und Rechnungen

Stand 24.09.2026. Grundlage: `docs/planung.md`, `docs/rechnungen-recht.md`, `docs/checkliste.md`,
`db/schema.sql` und `db/migrations/`, `apps/api/src/common`, `apps/api/src/auth`,
`apps/api/src/exports`, `apps/api/src/tenant`, `apps/api/src/db`, `deploy/*/compose.yml`.

Gegenstand ist die geplante Erweiterung: Kunden, Projekte, Aufgaben, Stundensätze, Timer und
manuelle Projektzeiten, im Betrieb die Aufteilung der Arbeitszeit auf Projekte; Solo-Mandant für
Freelancer; Rechnungen nach § 14 UStG mit fortlaufender Nummer, Unveränderbarkeit, Storno,
Abrechnungssperre und Zahlungsstatus; PDF (pdfkit), E-Rechnung (XRechnung/ZUGFeRD über
`@e-invoice-eu/core`, PDF/A-3 mit eingebettetem XML); Stundennachweis als PDF und CSV;
Freelancer-Persona in der Demo.

Nachtrag 25.09.2026: Leon hat entschieden, dass im Betrieb HR und Administration Rechnungen ausstellen und stornieren (beide mit Step-up); wo unten "nur `admin`" steht, gilt "HR und Admin". Datenmodell und Rendern richten sich nach `docs/planung-projekte.md`: Rendern nach dem Commit im Worker (D-02 umgesetzt), Muster-Kennzeichnung der Demo nach X-01 übernommen.

Tabellen-, Funktions-, Routen- und Dateinamen für Neues sind Vorschläge und als solche mit
"(neu)" gekennzeichnet. Alles andere verweist auf den Bestand.

## 1. Annahmen

Diese Annahmen stecken im Modell. Wo eine davon nicht stimmt, ändern sich die betroffenen
Maßnahmen (siehe Abschnitt 14).

1. Mandanten legt weiterhin nur die CLI an (`docs/planung.md`, "Mandanten legt nur die CLI im
   API-Image an"). "Solo nur auf Einladung durch Admin" heißt: der Betreiber legt den
   Solo-Mandanten per CLI an und verschickt die Einladung, kein Betriebs-Admin über die API.
2. Eine Person gehört genau einem Mandanten (`app.users.email` bleibt global eindeutig), es gibt
   keinen Mandantenwechsel innerhalb einer Sitzung.
3. Das System verschickt Rechnungen nicht selbst per Mail. Die Nutzerin lädt PDF/XML herunter.
4. In Version 1 gibt es keinen Upload (kein Logo, keine Anhänge, kein Empfang fremder
   E-Rechnungen). `docs/rechnungen-recht.md` führt den E-Rechnungs-Empfang allerdings unter
   "Muss in Version 1"; das ist ein offener Widerspruch (Abschnitt 14, Punkt 1).
5. Rechnungen, Kunden, Sätze und Zahlungen sind im Betrieb der Rolle `admin` vorbehalten. Im
   Solo-Mandanten ist die eine Person `admin`.
6. Dokumente (PDF, XML) liegen als `bytea` in der Datenbank, nicht im Dateisystem. Der API-Container
   läuft `read_only` (`docs/planung.md`, Betrieb), ein Volume für Dateien wäre eine neue Angriffsfläche.

## 2. Systembild und Vertrauensgrenzen

| Nr. | Komponente                                                                | Vertrauensgrenze davor                                                                                              |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| K1  | SPA (Vite/React)                                                          | Browser des Nutzers, nicht vertrauenswürdig                                                                         |
| K2  | API-Module `projects`, `invoices` (neu), `exports`                        | Caddy -> API, Guards `Throttler -> Session -> Csrf -> Enrollment -> Roles -> Reauth` (`apps/api/src/app.module.ts`) |
| K3  | Tabellen in `app` (neu), RLS mit RESTRICTIVE-Zaun + FORCE                 | API als `zeit_app`, setzt den Kontext selbst per `set_config`                                                       |
| K4  | SECURITY-DEFINER-Funktionen (neu) im Besitz von `zeit_system` (BYPASSRLS) | `zeit_app` -> `zeit_system`, hier endet der RLS-Schutz                                                              |
| K5  | Renderer: pdfkit, `@e-invoice-eu/core`                                    | Nutzertext -> Dokument, das den Betrieb verlässt (Kunde, Finanzamt)                                                 |
| K6  | Exporte: Stundennachweis PDF/CSV                                          | Nutzertext -> Tabellenkalkulation beim Empfänger                                                                    |
| K7  | Demo-Sandbox, Freelancer-Persona                                          | anonyme Besucher                                                                                                    |
| K8  | Betrieb: `zeit_owner`, Superuser, Backup, Restore                         | außerhalb der App, nur Erkennung möglich                                                                            |

Angreifer:

- A1 anonymer Besucher der Demo
- A2 Mitglied von Mandant X gegen Mandant Y (auch Betrieb gegen Solo und umgekehrt)
- A3 Beschäftigte oder Teamleitung im Betrieb gegen Sätze, Umsätze, Rechnungen
- A4 Admin oder Freelancer selbst als Insider: Umsatz verschleiern, rückdatieren, Belege nachträglich ändern (GoBD-Sicht)
- A5 gestohlene Sitzung
- A6 Betreiber oder Angreifer mit `zeit_owner`- bzw. Superuser-Zugang
- A7 kompromittierte Abhängigkeit (pdfkit, `@e-invoice-eu/core`, Schriften)

Grenze des Modells: Wer beliebiges SQL als `zeit_app` ausführen kann, kann jeden
Mandanten-Kontext setzen, denn `app.tenant_id()` und `app.role()` lesen nur, was die App per
`set_config` gesetzt hat (`apps/api/src/db/database.ts`, `withTenant`). RLS schützt gegen
Logikfehler der App, nicht gegen SQL-Injection. Deshalb tragen die Grants die Unveränderbarkeit:
Auch mit freier SQL-Ausführung als `zeit_app` darf keine ausgestellte Rechnung änderbar sein.

## 3. Befunde im Bestand, die die Erweiterung betreffen

Die meisten Befunde sind heute nicht ausnutzbar und werden es erst, wenn die Rechnungstabellen
das bestehende Muster übernehmen. B3 und B12 gelten schon heute, B3 setzt einen kompromittierten
API-Prozess voraus, B12 verrät nur die Existenz einer Adresse.

- **B1 Purge-Ausnahme über einen frei setzbaren GUC.** `app.reject_change()` (`db/schema.sql:613`)
  und `app.guard_time_entry()` (`db/schema.sql:501`) lassen DELETE zu, wenn
  `current_setting('zeit.purge_tenant')` die Mandanten-ID trägt. Platzhalter-GUCs mit Punkt darf
  jede Rolle setzen, also auch `zeit_app`. Heute harmlos, weil `zeit_app` auf den Journalen kein
  DELETE-Recht hat (Grants in `20260924000100_time.sql:279` ff., DELETE nur auf `team_leads`,
  `contracts`, `ops.rate_limits`). Bekommt `zeit_app` DELETE auf Entwürfe und liegen Entwurf und
  ausgestellte Rechnung in derselben Tabelle, löscht ein `set_config('zeit.purge_tenant', <eigener
Mandant>, true)` ausgestellte Rechnungen.
- **B2 Kaskade beim Löschen eines Mandanten.** Alle Fremdschlüssel auf `app.tenants` stehen auf
  `ON DELETE CASCADE` (`db/schema.sql:3332` ff.). Heute löscht nur `ops.purge_sandbox()`
  und nur Sandboxes. Für Rechnungen mit acht Jahren Aufbewahrungspflicht darf ein Live-Mandant nie
  per Kaskade verschwinden, auch nicht durch einen Handgriff mit Owner-Rechten.
- **B3 `zeit_app` darf Live-Mandanten anlegen.** `grant select, insert, update on app.tenants`
  (`20260923000000_core.sql:536`) plus Policy "admins create the tenant" (`db/schema.sql:3789`),
  die nur `app.role() = 'admin'` prüft. Die CLI nutzt genau diesen Weg (`apps/api/src/cli/tenant-create.ts`).
  Ein kompromittierter API-Prozess kann damit beliebige Live- oder Solo-Mandanten erzeugen.
- **B4 Protokoll außerhalb der Fachtransaktion.** `Audit.record` (`apps/api/src/common/audit.ts`)
  öffnet eine eigene Transaktion. Für Ausstellung und Storno muss der Eintrag in derselben
  Transaktion liegen, sonst gibt es Rechnungen ohne Protokoll oder Protokoll ohne Rechnung.
- **B5 `audit.track()` kopiert ganze Zeilen.** Das Diff enthält jede Spalte außer `updated_at` und
  `last_login_at` (`db/schema.sql:734`). Ein PDF als `bytea` landet damit hexkodiert im
  append-only `audit.log`, ein Snapshot mit Anschrift ebenso, und das Protokoll wird nie gelöscht.
- **B6 HR liest das ganze Protokoll.** Policy "hr and admins read the trail"
  (`db/schema.sql:4384`) gibt `hr` alle Einträge des Mandanten, also künftig auch Diffs von
  Rechnungen, Sätzen und Kunden, obwohl diese nur `admin` sehen soll.
- **B7 CSV-Schutz trifft negative Dezimalzahlen als Text.** `toCsv` stellt jedem Text mit
  führendem `-` ein Hochkomma voran (`apps/api/src/exports/csv.ts`). Beträge laufen im deutschen
  Format als Text (`decimal()` in `exports.service.ts`). Ein Storno-Betrag `-120,00` käme als
  `'-120,00` an und wäre in der Tabelle keine Zahl mehr.
- **B8 Textschema lässt in XML verbotene Zeichen durch.** `plainText`/`multilineText`
  (`packages/shared/src/common.ts`) sperren `\p{Cc}` und Bidi-Steuerzeichen, aber nicht U+FFFE,
  U+FFFF und einzelne Surrogate. XML 1.0 verbietet diese Zeichen; der XML-Builder bricht ab oder
  schreibt ein ungültiges Dokument.
- **B9 Der bestehende Stundenzettel enthält Gesundheitsdaten.** `timesheetRows` in
  `apps/api/src/exports/exports.service.ts` schreibt die Abwesenheitsart (auch `sick`). Ein
  Stundennachweis für Kunden darf nicht auf diesem Export aufbauen.
- **B10 Throttler vor der Sitzung, Pool und Transaktions-Timeout.** Der `ThrottlerGuard` läuft vor
  dem `SessionGuard` und zählt je IP (`app.module.ts`, `common/throttle.ts`), ein Limit je Nutzer
  braucht einen eigenen Guard auf Routenebene. Der Pool hat 10 Verbindungen (`database.ts`,
  `POOL`), `idle_in_transaction_session_timeout` ist 30 s (`db/init/00-roles.sh`). Rendern
  innerhalb einer offenen Transaktion blockiert Verbindungen und wird bei langen Dokumenten
  abgebrochen.
- **B11 Backup läuft als Tabelleneigentümer.** `zeit-live-backup` nutzt `zeit_owner`
  (`deploy/live/compose.yml`). Wer den Backup-Container übernimmt, kann Trigger abschalten und
  Rechnungen ändern.
- **B12 Querverweis über 409.** Lädt ein Admin eine E-Mail-Adresse ein, die in einem anderen
  Mandanten existiert, antwortet die API mit 409 `ALREADY_EXISTS` (globale Eindeutigkeit in
  `app.users`). Das verrät, dass die Adresse irgendwo registriert ist.

## 4. Datenmodell, auf das sich die Maßnahmen beziehen (Vorschlag)

- `app.tenants.mode` (neu, Enum `app.tenant_mode`: `team` | `solo`), `app.tenants.sandbox_group` (neu, uuid, nur Sandbox)
- `app.billing_profiles` (neu, 1:1 je Mandant): Firma, Anschrift, Steuernummer, USt-IdNr., IBAN, BIC, Kleinunternehmer, Nummernpräfix
- `app.customers`, `app.projects`, `app.tasks` (neu, veränderliche Stammdaten mit `archived_at`)
- `app.rates` (neu, Historie mit `valid_from`, append-only, nur `admin`)
- `app.project_entries` (neu): `employee_id`, `project_id`, `task_id`, `started_at`, `ended_at`, `source` (`timer` | `manual` | `allocation`), `time_entry_id` (Betrieb), `voided_at`, `confirmed_at`
- `app.invoice_drafts`, `app.invoice_draft_lines` (neu, veränderlich und löschbar, ohne Spalten für Nummer, Status oder Summen)
- `app.invoice_counters` (neu): `tenant_id`, `series`, `year`, `next_no`
- `app.invoices` (neu): `number`, `series`, `year`, `seq`, `kind` (`invoice` | `cancellation`), `cancels_invoice_id`, `issue_date`, `service_from`, `service_to`, `snapshot jsonb`, Summen, `specimen`, `content_hash`, `chain_hash`, `retain_until`, `created_by`
- `app.invoice_lines` (neu, nur INSERT)
- `app.invoice_entries` (neu): `invoice_id`, `entry_id`, `released_by_invoice_id` (Abrechnungssperre)
- `app.invoice_documents` (neu): `invoice_id`, `kind` (`pdf` | `xrechnung` | `zugferd`), `body bytea`, `sha256`
- `app.invoice_payments` (neu, append-only)
- Funktionen (neu, SECURITY DEFINER, Eigentümer `zeit_system`, `search_path = ''`): `app.invoice_issue(p_draft_id)`, `app.invoice_cancel(p_invoice_id, p_reason)`, `app.invoice_series_start(p_series, p_year, p_next)`, `app.invoice_chain_verify()`, `ops.sandbox_create(...)`
- Neuer Fehlercode `ZT004` -> 409 `BILLED_LOCKED` in `apps/api/src/db/errors.ts` und `packages/shared/src/errors.ts`

Migrationen (neu): `db/migrations/20260926000000_projects.sql`, `db/migrations/20260926000100_invoices.sql`,
`db/migrations/20260925000200_purge_guard.sql`.

## 5. K3/K4: Unveränderbarkeit ausgestellter Rechnungen

### R-01 Ausgestellte Rechnung per UPDATE oder DELETE ändern (Tampering)

Angriff: A4 über einen künftigen PATCH-Endpunkt, A5, SQL-Injection als `zeit_app`.

- Maßnahme: Ausgestellte Daten liegen in eigenen Tabellen (`app.invoices`, `app.invoice_lines`,
  `app.invoice_documents`), getrennt von den Entwürfen. `zeit_app` bekommt dort nur SELECT, kein
  UPDATE, kein DELETE, kein TRUNCATE. Dazu `BEFORE UPDATE OR DELETE ... app.reject_change()` und
  `BEFORE TRUNCATE ... app.reject_change()` wie bei `flex_bookings`. RLS: nur eine SELECT-Policy
  für `admin`. Der Zahlungsstatus ist keine Spalte der Rechnung, sondern ergibt sich aus
  `app.invoice_payments` (R-10). Die API hat keine PATCH- oder DELETE-Route auf `/invoices`.
- Ort: `db/migrations/20260926000100_invoices.sql` (neu), Grants am Ende wie in
  `20260924000100_time.sql`.
- Priorität: muss
- Test: `apps/api/test/db/journals.int.spec.ts`, Liste `journals` um die drei Tabellen erweitern:
  "zeit_app mit Admin-Kontext bekommt bei update und delete 42501, der Superuser bei update, delete
  und truncate ZT002."

### R-02 Rechnung direkt einfügen, mit frei gewählter Nummer, Datum oder Summe (Tampering, Elevation)

Angriff: A4 oder SQL-Injection legt eine Rechnung mit Nummer `2026-0001` doppelt, rückdatiert
oder mit Summen an, die nicht zu den Positionen passen.

- Maßnahme: Kein INSERT-Recht für `zeit_app` auf `app.invoices`, `app.invoice_lines`,
  `app.invoice_counters`. Ausstellung nur über `app.invoice_issue(p_draft_id)`. Die Funktion prüft
  `app.role() = 'admin'` und `d.tenant_id = app.tenant_id()` (BYPASSRLS, also jede Abfrage selbst
  filtern wie in `app.display_names`), vergibt die Nummer (N-01), setzt
  `issue_date = (now() at time zone 'Europe/Berlin')::date`, leitet den Leistungszeitraum aus den
  verknüpften Buchungen ab, rechnet Positions- und Gesamtsummen in `numeric` neu, kopiert
  Verkäufer- und Käuferdaten in `snapshot` und setzt `created_by = app.user_id()`. Der Client
  schickt nur die Entwurfs-ID.
- Ort: Migration wie oben; Aufruf in `apps/api/src/invoices/invoices.store.ts` (neu) per
  `sql\`select app.invoice_issue(${draftId})\``.
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts` (neu): "insert into app.invoices als zeit_app
  scheitert mit 42501; invoice_issue mit einem Entwurf aus Mandant B im Kontext von Mandant A
  scheitert mit 42501; als team_lead ebenfalls 42501."

### R-03 Sperre über `zeit.purge_tenant` umgehen (Tampering, Befund B1)

- Maßnahme: Die Löschausnahme in `app.reject_change()` und `app.guard_time_entry()` zusätzlich an
  `current_user <> 'zeit_app'` binden. Direkte Löschungen der App laufen als `zeit_app`, die
  Kaskade aus dem Purge nicht. Welcher `current_user` im Kaskadenfall ankommt (Eigentümer der
  Tabelle oder `zeit_system`), vorher per Test belegen und die Bedingung genau darauf setzen.
  Entwürfe liegen in eigenen Tabellen (R-01), damit ein DELETE-Recht auf Entwürfe nie die
  ausgestellten Rechnungen berührt.
- Ort: `db/migrations/20260925000200_purge_guard.sql` (neu), `create or replace function` beider
  Funktionen.
- Priorität: muss
- Test: `apps/api/test/db/journals.int.spec.ts`: "zeit_app setzt `zeit.purge_tenant` auf den eigenen
  Mandanten und löscht aus app.invoices: 42501; derselbe Versuch auf eine Tabelle mit DELETE-Recht
  und reject_change-Trigger: ZT002; der Sandbox-Purge räumt weiterhin alles ab."

### R-04 Live-Mandant samt Rechnungen per Kaskade löschen (Tampering, Befund B2)

- Maßnahme: `BEFORE DELETE ON app.tenants` mit Abbruch, wenn `old.kind = 'live'`. Nur der
  Sandbox-Purge löscht Mandanten, er ist davon nicht betroffen. Die Fremdschlüssel von
  `app.invoices` auf `app.customers` und `app.users` stehen auf `ON DELETE RESTRICT`, nie auf CASCADE.
- Ort: `db/migrations/20260925000200_purge_guard.sql` (neu).
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts`: "delete from app.tenants auf einen Live-Mandanten
  scheitert auch für den Superuser mit ZT002; ein abgelaufener Sandbox-Mandant mit Rechnungen wird
  vom Purge vollständig entfernt."

### R-05 Trigger-Umgehung durch Eigentümer oder Superuser (Tampering, Repudiation)

Angriff: A6 mit `ALTER TABLE ... DISABLE TRIGGER`, `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY`,
`SET session_replication_role = replica`, `pg_restore --clean` eines manipulierten Dumps.

- Maßnahme: Verhindern lässt sich das nicht, nur erkennen und erschweren.
  1. `zeit_owner` bleibt nur im Migrations-Job und in der DB (heute so, `deploy/live/compose.yml`),
     nie im API-Container.
  2. Backup mit einer eigenen Rolle `zeit_backup` (LOGIN, BYPASSRLS, Mitglied von
     `pg_read_all_data`, keine Schreibrechte) statt `zeit_owner` (Befund B11).
  3. Kein `GRANT SET ON PARAMETER session_replication_role` an irgendeine App-Rolle.
  4. Hash-Kette: `app.invoice_issue` setzt unter der Zählersperre
     `content_hash = sha256(convert_to(snapshot::text, 'UTF8'))` und
     `chain_hash = sha256(vorheriger chain_hash || content_hash)` je Mandant und Serie
     (`sha256(bytea)` ist ab PostgreSQL 11 eingebaut, `jsonb::text` ist stabil sortiert).
     `app.invoice_chain_verify()` prüft die Kette und die Dokument-Prüfsummen täglich im
     bestehenden Job-Rahmen (`apps/api/src/jobs/`, hinter `pg_try_advisory_lock`).
  5. Den letzten `chain_hash` und die letzte Nummer je Mandant täglich an ein Ziel außerhalb des
     Servers geben (Backup-Manifest oder Mail), damit ein Neuschreiben der ganzen Kette auffällt.
  6. Verfahrensdokumentation nennt, wer Owner-Zugang hat.
- Ort: Migration `20260926000100_invoices.sql`, `db/init/00-roles.sh` (Rolle `zeit_backup`),
  `deploy/live/compose.yml` (Backup-Dienst), `apps/api/src/jobs/invoice-chain.job.ts` (neu).
- Priorität: 1–3 muss, 4–6 sollte
- Test: `apps/api/test/db/invoices.int.spec.ts`: "Nach einem update per Superuser bei
  abgeschaltetem Trigger meldet app.invoice_chain_verify() die erste abweichende Rechnungsnummer."

### R-06 Stammdaten ändern und damit alte Rechnungen umschreiben (Repudiation)

Angriff: A4 ändert Kundenanschrift, Steuernummer oder Satz; der Renderer zieht beim nächsten
Download die neuen Werte.

- Maßnahme: Renderer arbeiten ausschließlich aus `app.invoices.snapshot` und `app.invoice_lines`,
  nie aus `customers`, `billing_profiles` oder `rates`. Gespeicherte Dokumente werden beim
  Download ausgeliefert, nicht neu erzeugt.
- Ort: `apps/api/src/invoices/render/` (neu).
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts` (neu): "Nach Änderung der Kundenanschrift
  liefert GET /invoices/:id/documents/pdf dasselbe Dokument (gleiche sha256), die Vorschau eines
  neuen Entwurfs zeigt die neue Anschrift."

### R-07 Dokument austauschen oder vom Beleg abweichen lassen (Tampering)

- Maßnahme: `app.invoice_documents` nur INSERT, `unique (tenant_id, invoice_id, kind)`, Prüfsumme
  im Trigger `new.sha256 := sha256(new.body)` (ein mitgeschickter Wert wird überschrieben), Check
  `octet_length(body) <= 5242880`. PDF und XML aus demselben berechneten Objekt. `CreationDate` des
  PDF gleich `issued_at`, damit die Ausgabe reproduzierbar ist; ob pdfkit dann byte-gleich
  erzeugt, per Test belegen, sonst gilt das gespeicherte Original.
- Ort: Migration `20260926000100_invoices.sql`, `apps/api/src/invoices/render/pdf.ts` (neu).
- Priorität: muss (insert-only, unique, Prüfsumme), sollte (Reproduzierbarkeit)
- Test: `apps/api/test/db/invoices.int.spec.ts`: "Ein zweites PDF zur selben Rechnung scheitert mit
  23505, eine falsche mitgeschickte Prüfsumme steht danach als sha256(body) in der Zeile."

### R-08 Storno missbrauchen (Tampering)

Angriff: doppelte Stornierung, Stornierung einer Stornorechnung, Storno mit abweichenden
Beträgen, Storno als verdecktes Löschen.

- Maßnahme: `app.invoice_cancel(p_invoice_id, p_reason)` erzeugt die Stornorechnung selbst: Positionen
  als exakte Negation des Originals, eigene Nummer aus derselben Serie, `cancels_invoice_id`.
  Partieller Unique-Index auf `(tenant_id, cancels_invoice_id) where kind = 'cancellation'`, Check
  "Ziel ist `kind = 'invoice'`". Grund Pflicht (`reasonSchema`, mindestens 10 Zeichen). Das
  Original bleibt unverändert, "storniert" ist ein abgeleiteter Zustand. Step-up (Abschnitt 12).
- Ort: Migration `20260926000100_invoices.sql`, Route `POST /invoices/:id/cancel` (neu) mit
  `@Roles('admin')` und `@RequireReauth()`.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Die zweite Stornierung derselben Rechnung
  ergibt 409 ALREADY_EXISTS, die Stornierung einer Stornorechnung 409 INVALID_STATE, die Summe aus
  Rechnung und Storno ist 0,00."

### R-09 Abgerechnete Zeiten ändern oder doppelt abrechnen (Tampering)

- Maßnahme: `app.invoice_entries` mit partiellem Unique-Index `(tenant_id, entry_id) where
released_by_invoice_id is null`: eine Buchung hängt an höchstens einer gültigen Rechnung. Die
  Storno-Funktion setzt `released_by_invoice_id` genau einmal von NULL (Muster wie
  `app.guard_time_entry()`). Trigger auf `app.project_entries` bricht UPDATE und Void mit `ZT004`
  ab, solange eine gültige Verknüpfung besteht. Im Betrieb derselbe Abbruch, wenn eine Korrektur
  eine `app.time_entries`-Zeile storniert, deren Projektzuordnung abgerechnet ist. Entwürfe nehmen
  nur beendete, nicht stornierte, bestätigte Buchungen (T-02).
- Ort: Migrationen `20260926000000_projects.sql` und `20260926000100_invoices.sql`,
  `apps/api/src/db/errors.ts`, `packages/shared/src/errors.ts`.
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts`: "Void einer abgerechneten Projektbuchung ergibt 409
  BILLED_LOCKED, nach dem Storno ist sie wieder änderbar; dieselbe Buchung in zwei Entwürfen: die
  zweite Ausstellung scheitert mit 409 ALREADY_EXISTS."

### R-10 Zahlungsstatus verschleiern (Repudiation)

- Maßnahme: `app.invoice_payments` append-only (`amount numeric(12,2) <> 0`, `paid_on <= heute`,
  Methode, Notiz). Rückbuchung als eigene Zeile mit negativem Betrag und Pflichtgrund. Status
  (offen, teilweise, bezahlt, überfällig) wird aus Zahlungen, Summe und Fälligkeit mit der
  Serveruhr berechnet, nicht gespeichert. Nur `admin`.
- Ort: Migration `20260926000100_invoices.sql`.
- Priorität: sollte
- Test: `apps/api/test/db/journals.int.spec.ts`: "update und delete auf app.invoice_payments ergeben
  ZT002; eine Rückbuchung ohne Grund ergibt 400 VALIDATION."

## 6. K3/K4: Nummernkreis

### N-01 Doppelvergabe unter Nebenläufigkeit (Tampering)

- Maßnahme: In `app.invoice_issue` und `app.invoice_cancel`:
  `insert into app.invoice_counters (tenant_id, series, year, next_no) values (app.tenant_id(), s, y, 2)
on conflict (tenant_id, series, year) do update set next_no = invoice_counters.next_no + 1
returning next_no - 1`. Der Upsert sperrt die Zeile bis zum Commit, auch beim allerersten
  Beleg eines Jahres. Dazu `unique (tenant_id, number)` und `unique (tenant_id, series, year, seq)`.
  Keine Sequenz: `nextval` ist nicht transaktional und reißt bei jedem Rollback Lücken.
- Ort: Migration `20260926000100_invoices.sql`.
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts`: "20 parallele Ausstellungen auf leerem und auf
  vorhandenem Zähler ergeben 20 verschiedene, lückenlos aufsteigende Nummern ohne 23505."

### N-02 Lücken erzwingen oder den Zähler verstellen (Tampering)

- Maßnahme: Zähler und Rechnung in derselben Transaktion; scheitert irgendetwas nach der Vergabe,
  rollt der Zähler mit zurück. `zeit_app` hat auf `app.invoice_counters` keine Rechte. Startwert
  (Umzug aus einem anderen Programm) nur über `app.invoice_series_start`, nur solange in der Serie
  und dem Jahr noch kein Beleg existiert, mit Step-up und Protokoll. Präfix per zod
  `^[A-Z0-9-]{0,10}$`, weil er in Dateinamen, PDF und XML landet.
- Ort: Migration, `packages/shared/src/invoices.ts` (neu), Route `PUT /invoice-series/:series/start` (neu).
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts`: "Eine Ausstellung, die nach der Nummernvergabe an
  einer Positionsprüfung scheitert, lässt den Zählerstand unverändert; Startwert setzen nach der
  ersten Rechnung ergibt 409 INVALID_STATE."

### N-03 Rückdatieren in ein anderes Jahr oder eine andere Periode (Tampering)

- Maßnahme: Ausstellungsdatum und Serienjahr kommen aus `now()` der Datenbank in Europe/Berlin.
  Die Entwurfs- und Ausstellungs-Schemas sind `z.strictObject` ohne Datumsfeld für die Ausstellung.
  Der Leistungszeitraum ist ein eigenes, abgeleitetes Feld.
- Ort: `app.invoice_issue`, `packages/shared/src/invoices.ts` (neu).
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Ein Feld issueDate im Request ergibt 400
  VALIDATION, die Rechnung trägt (now() at time zone 'Europe/Berlin')::date."

### N-04 Nummern raten und aufzählen (Information Disclosure)

- Maßnahme: Routen adressieren Rechnungen nur über die UUID, nie über die Nummer. Keine
  öffentlichen oder tokenbasierten Download-Links. Fremde und nicht vorhandene IDs antworten
  gleich mit 404. Suche nach Nummer nur innerhalb des Mandanten (RLS).
- Ort: `apps/api/src/invoices/invoices.controller.ts` (neu), Zeilen in
  `apps/api/test/security/role-matrix.int.spec.ts`.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "GET /invoices/:id mit der ID einer Rechnung
  aus Mandant B ergibt 404 mit demselben Body wie eine zufällige UUID."

### N-05 Doppelvergabe nach einem Restore (Tampering)

Angriff: kein Angreifer nötig. Ein Restore auf den Stand von gestern setzt den Zähler zurück, die
seitdem verschickten Nummern werden neu vergeben.

- Maßnahme: Runbook-Schritt nach jedem Restore: letzte Nummer je Mandant mit dem externen Stand
  aus R-05 (5.) abgleichen und den Zähler per `app.invoice_series_start` darüber setzen, vorher
  keine Ausstellung.
- Ort: `deploy/README.md`.
- Priorität: sollte
- Test: Restore-Test (monatlich, `docs/planung.md`, Betrieb): "Nach dem Restore ist der Zählerstand
  mit dem externen Stand abgeglichen und dokumentiert."

## 7. K2/K3: Zugriff und IDOR

### Z-01 Fremde Kunden, Projekte, Rechnungen, Dokumente per ID (Information Disclosure, Tampering)

- Maßnahme: Jede neue Tabelle mit `tenant_id not null`, `unique (tenant_id, id)`, zusammengesetzten
  Fremdschlüsseln `(tenant_id, x_id)`, RESTRICTIVE-Zaun und FORCE. Die neuen Tabellen in die Liste
  `tables` des Meta-Tests aufnehmen (der Test "knows every table that belongs to a tenant" scheitert
  von selbst, bis das passiert). Jede Definer-Funktion filtert selbst nach `app.tenant_id()`.
- Ort: Migrationen, `apps/api/test/db/rls.int.spec.ts`.
- Priorität: muss
- Test: `apps/api/test/db/rls.int.spec.ts`, `it.each(tables)`: "Mandant A sieht in app.invoices,
  app.invoice_documents, app.customers, app.project_entries keine Zeile von Mandant B"; dazu
  `apps/api/test/invoices/invoices.int.spec.ts`: "GET /invoices/:id/documents/pdf auf eine
  Rechnung aus Mandant B ergibt 404."

### Z-02 Beschäftigte und Teamleitung sehen Sätze, Umsätze, Rechnungen (Information Disclosure)

- Maßnahme: `@Roles('admin')` auf Kunden schreiben, Sätze, Entwürfe, Rechnungen, Zahlungen,
  Rechnungsstammdaten. Sätze in eigener Tabelle `app.rates` mit reiner Admin-Policy, damit die
  Projektliste für Beschäftigte keine Satzspalte enthalten kann. Jede neue Route bekommt eine Zeile
  in der Rollen-Matrix, sonst scheitert der Test.
- Ort: Controller in `apps/api/src/projects/`, `apps/api/src/invoices/` (neu),
  `apps/api/test/security/role-matrix.int.spec.ts`.
- Priorität: muss
- Test: `apps/api/test/db/projects.int.spec.ts` (neu): "Als Beschäftigte liefert select auf app.rates
  0 Zeilen; GET /invoices ergibt 403; die Antwort von GET /projects enthält kein Feld rate."

### Z-03 Ungeeignete Buchungen in einen Entwurf übernehmen (Tampering, Elevation)

Angriff: Entwurf mit IDs von Buchungen anderer Kunden, laufender Timer, stornierter Buchungen oder
schon abgerechneter Zeiten.

- Maßnahme: Entwurf entsteht aus Kunde, Projekt(en) und Zeitraum; die Buchungen wählt der Server.
  Schickt der Client einzelne IDs, prüft eine Abfrage: gleicher Mandant (RLS), Projekt gehört zum
  Kunden des Entwurfs (zusammengesetzter Fremdschlüssel über `(tenant_id, customer_id)`),
  `ended_at is not null`, `voided_at is null`, nicht abgerechnet, bestätigt.
- Ort: `apps/api/src/invoices/invoices.service.ts` (neu), Migration.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Ein Entwurf mit der ID eines laufenden Timers
  oder einer Buchung eines anderen Kunden ergibt 409 INVALID_STATE und legt keine Position an."

### Z-04 Projektbuchungen anderer Beschäftigter lesen oder ändern (Information Disclosure, Tampering)

- Maßnahme: Policies auf `app.project_entries` nach dem Muster von `app.time_entries`: "read own",
  "leads read their team's", "hr manages", INSERT nur mit `employee_id = app.employee_id()`.
  Im Service `assertCanSee` (`apps/api/src/common/scope.ts`).
- Ort: Migration `20260926000000_projects.sql`, `apps/api/src/projects/` (neu).
- Priorität: muss
- Test: `apps/api/test/db/projects.int.spec.ts`: "Beschäftigte A bekommt bei GET
  /project-entries?employee=<B> 403 und beim direkten select 0 Zeilen."

### Z-05 Mass Assignment in Entwürfen (Tampering)

- Maßnahme: zod-Schemas als `z.strictObject` in `packages/shared/src/invoices.ts` (neu). Positionen
  nur mit Menge, Einheit, Einzelpreis, Steuersatz (Enum 19/7/0 mit Befreiungsgrund) und Text.
  `app.invoice_drafts` hat keine Spalten für Nummer, Status oder Summen.
- Ort: `packages/shared/src/invoices.ts` (neu), Migration.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "PATCH /invoice-drafts/:id mit number oder
  totalNet im Body ergibt 400 VALIDATION."

### Z-06 Dokumente im Cache oder im Browser-Kontext (Information Disclosure)

- Maßnahme: Downloads mit `Cache-Control: no-store`, `Content-Disposition: attachment`, exaktem
  `Content-Type` (`application/pdf`, `application/xml`) und `nosniff` (helmet setzt es schon).
  Dateiname aus der Nummer, bereinigt wie in `exports.service.ts` (`replace(/[^\w-]/g, '_')`).
- Ort: `apps/api/src/invoices/invoices.controller.ts` (neu), analog `attach()` in
  `apps/api/src/exports/exports.controller.ts`.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "GET /invoices/:id/documents/pdf antwortet
  mit no-store, attachment und application/pdf, der Dateiname enthält nur [A-Za-z0-9_-]."

### Z-07 Teure GET-Aufrufe von einer anderen Subdomain (Denial of Service)

Angriff: Eine Seite auf irgendeiner `*.dmn-software.com`-Subdomain bindet
`<img src="https://zeit.dmn-software.com/api/exports/project-timesheet?format=pdf">` ein. Die
Anfrage ist same-site, das `SameSite=Strict`-Cookie geht mit, der `CsrfGuard` prüft GET nicht.
Lesen kann der Angreifer die Antwort nicht, aber er lässt im Namen des Opfers rendern.

- Maßnahme: Alles, was rendert (Entwurfsvorschau, Stundennachweis-PDF), als POST hinter dem
  `CsrfGuard`. Gespeicherte Dokumente dürfen GET bleiben.
- Ort: Controller (neu).
- Priorität: sollte
- Test: `apps/api/test/auth/csrf.int.spec.ts`: "POST /exports/project-timesheet mit Sec-Fetch-Site:
  same-site ergibt 403 CSRF."

Nachtrag 01.10.2026: Die rendernden Routen `GET /invoices/:id/preview.pdf`,
`GET /invoices/:id/time-report` und `GET /exports/time-report` bleiben GET. Die Vorschau ist die
Quelle eines `iframe` im Rechnungseditor und kann deshalb nur GET sein. Keine der drei Routen ändert
Zustand, alle hängen an der Session mit `SameSite=Strict`-Cookie und an der Rollenprüfung. Die Last
begrenzen das Limit je Nutzer (`UserRateLimit`, je Route 20/min) und die Render-Warteschlange
(`RenderLimitGuard`, 2 gleichzeitig je Prozess, 10 wartend, danach 503 mit `Retry-After`). Eine
Seite auf einer anderen Subdomain kann eine Anfrage auslösen, die Antwort aber nicht lesen, weil die
API keine CORS-Freigabe setzt. Übrig bleibt Rechenzeit im Namen des Opfers bis zu seinem
Nutzerlimit; das ist hingenommen, die Maßnahme oben wird nicht umgesetzt.

Nachtrag 02.10.2026: `GET /invoices/:id/document` und `GET /invoices/:id/xml` bleiben ebenfalls
GET. Sie liefern das gespeicherte Original. Nur wenn es nach dem Ausstellen fehlt, rendern sie es
einmal aus dem Schnappschuss nach und speichern es (D-02 Punkt 3); danach kommt es wieder aus der
DB. Das ist kein fachlicher Zustandswechsel, jeder Abruf ergibt dasselbe Dokument, ein Fehlschlag
wird 30 s gemerkt (`FAILURE_TTL_MS` in `apps/api/src/documents/documents.service.ts`), und ein
Download muss als einfacher Link funktionieren.

## 8. K2/K3: Mandant, Solo-Bereich und Mandantentyp

### M-01 Mandantentyp wechseln, um Regeln zu umgehen (Elevation of Privilege)

Angriff: Ein Betriebs-Admin schaltet auf `solo`, weil dort die Vier-Augen-Regeln wegfallen
könnten, oder ein Solo-Admin schaltet auf `team`, um weitere Personen einzuladen.

- Maßnahme: `app.tenants.mode` steht nicht in der Spaltenliste des UPDATE-Grants an `zeit_app`
  (heute `name, state, holiday_options, ...` in `20260924000500_auth_hardening.sql`) und nicht im
  `updateTenantSchema`. Gesetzt wird der Typ nur von der CLI bei der Anlage. In die bestehenden
  Guards (`app.guard_request_status()`, `app.guard_own_user()`) kommt keine Solo-Ausnahme; der
  Solo-Bereich nutzt Korrekturen und Genehmigungen einfach nicht. Welche Routen im Solo-Mandanten
  erreichbar sind, entscheidet ein Guard nach `mode` aus `auth.session_resolve` (bei jedem Request
  aus der DB, nie aus Client-Angaben).
- Ort: Migration `20260926000000_projects.sql`, `packages/shared/src/tenant.ts`,
  `apps/api/src/cli/tenant-create.ts`, `auth.session_resolve` (Spalte ergänzen).
- Priorität: muss
- Test: `apps/api/test/db/access.int.spec.ts`: "update app.tenants set mode = 'solo' als zeit_app mit
  Admin-Kontext ergibt 42501; PATCH /tenant mit mode ergibt 400 VALIDATION."

### M-02 Solo-Mandant mit mehreren Personen (Elevation of Privilege)

- Maßnahme: `BEFORE INSERT OR UPDATE ON app.users`: im Solo-Mandanten höchstens eine Person, Rolle
  `admin`. Gegen zwei gleichzeitige Einladungen `pg_advisory_xact_lock(hashtextextended('users ' ||
new.tenant_id::text, 0))` wie in `app.apply_month_closing()`. `POST /users` antwortet im
  Solo-Mandanten mit 409.
- Ort: Migration `20260926000000_projects.sql`, `apps/api/src/users/users.service.ts`.
- Priorität: muss
- Test: `apps/api/test/db/access.int.spec.ts`: "Zwei parallele inserts in app.users eines
  Solo-Mandanten: einer gelingt, der andere scheitert mit 42501."

### M-03 Mandanten über die API anlegen (Spoofing, Elevation, Befund B3)

- Maßnahme: INSERT auf `app.tenants` für `zeit_app` entziehen. Die CLI verbindet sich mit einer
  eigenen Rolle (z. B. `zeit_cli` oder dem Migrations-Zugang), nicht als `zeit_app`. Sandboxes legt
  `ops.sandbox_create(...)` an, eine Definer-Funktion, die `kind = 'sandbox'` und
  `expires_at = now() + interval '24 hours'` selbst setzt.
- Ort: Migration `20260925000200_purge_guard.sql`, `apps/api/src/cli/tenant-create.ts`,
  `db/init/00-roles.sh`.
- Priorität: sollte
- Test: `apps/api/test/db/access.int.spec.ts`: "insert into app.tenants als zeit_app ergibt 42501;
  ops.sandbox_create legt nur kind = 'sandbox' mit gesetztem expires_at an."

### M-04 Übergriff zwischen Betrieb und Solo über Mandantenwechsel (Information Disclosure)

- Maßnahme: Kein Endpunkt übernimmt eine Mandanten-ID aus dem Request, Stores lesen sie nur aus
  `AuthSession`. Eine Person, ein Mandant. Wird später Mehrfachmitgliedschaft gebraucht: neue
  Sitzung je Mandant über eine Definer-Funktion, die die Mitgliedschaft prüft (Muster
  `ops.demo_switch_persona`), nie ein Umschalten innerhalb der Sitzung.
- Ort: alle neuen Services; Entwurfsregel in `docs/planung.md`.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Ein Body mit tenantId ergibt 400
  VALIDATION; eine Sitzung aus dem Solo-Mandanten sieht in keiner Liste Daten des Betriebs."

### M-05 Freelancer-Persona: Wechsel in fremde Sandboxes (Elevation of Privilege)

Gilt, wenn die Freelancer-Persona in einem eigenen Solo-Sandbox-Mandanten lebt (Abschnitt 14,
Punkt 3). `ops.demo_switch_persona` erlaubt heute nur Ziele im selben Mandanten.

- Maßnahme: `app.tenants.sandbox_group` (uuid) wird bei der Anlage beider Sandboxes gesetzt, kein
  UPDATE-Grant. Der Wechsel erlaubt Ziele mit gleicher Gruppe, `kind = 'sandbox'`, nicht abgelaufen.
  Der Purge räumt die Gruppe gemeinsam ab.
- Ort: `db/migrations/20260926000000_projects.sql` (neu), `ops.demo_switch_persona`,
  `ops.purge_sandbox`.
- Priorität: muss (falls eigener Mandant)
- Test: `apps/api/test/db/sessions.int.spec.ts`: "Wechsel auf eine Persona aus einer Sandbox mit
  anderer Gruppe liefert null, die alte Sitzung bleibt bestehen."

### M-06 Querverweis über 409 bei der Einladung (Information Disclosure, Befund B12)

- Maßnahme: Einladung antwortet immer gleich; existiert die Adresse schon woanders, geht an sie eine
  neutrale Mail statt eines Fehlers an den Einladenden.
- Ort: `apps/api/src/users/users.service.ts`.
- Priorität: sollte
- Test: `apps/api/test/users/*.int.spec.ts`: "POST /users mit einer Adresse aus einem anderen
  Mandanten antwortet wie mit einer neuen Adresse."

Nachtrag 25.09.2026 (Stufe 10a): Die Umsetzung weicht in den Namen von M-01, M-02 und M-05 ab, fachlich gilt alles unverändert. Die Spalte heißt `app.tenants.workspace` (Enum `app.workspace_kind` mit `company`/`solo`, nicht `mode`/`team`), beide Spalten und der Trigger stehen in `20260926000000_workspaces.sql`, nicht in `…_projects.sql`. `POST /users` und `POST /users/:id/invite` antworten im Solo-Bereich über den `WorkspaceGuard` mit 404 `NOT_FOUND` wie eine unbekannte Route, nicht mit 409. Ein zweiter Insert in `app.users` oder `app.employees` eines Solo-Mandanten scheitert im Trigger `app.guard_solo_members()` mit ZT003 (API: 409 `INVALID_STATE`), nicht mit 42501; der Advisory-Lock-Schlüssel ist `'solo_members ' || tenant_id` für beide Tabellen statt `'users '`. `PATCH /tenant` mit `workspace` im Body ergibt 200 ohne Wirkung statt 400, weil `updateTenantSchema` wie alle Schemas im Projekt unbekannte Felder verwirft; ein direktes UPDATE der Spalte als `zeit_app` scheitert davon unabhängig mit 42501. Die Betreiberbefehle aus Punkt 10 in Abschnitt 8 von `docs/planung-projekte.md` gibt es als `user:mfa-reset` und `tenant:archive` (`ops.mfa_reset_operator`, `ops.tenant_archive`, ausführbar nur für `zeit_owner`, Protokolleintrag mit Quelle `cli`).

## 9. K5/K6: Injection in PDF, XML und CSV

### I-01 XML-Injection über Freitexte (Tampering)

Angriff: Kundenname, Positionstext oder Leitweg-ID mit `</cbc:Name><cbc:ID>...`, `]]>` oder
verbotenen Zeichen.

- Maßnahme: XML entsteht nur über `@e-invoice-eu/core` aus einem JSON-Objekt, nie über
  Template-Strings. Alle Rechnungs-Freitexte laufen durch `plainText`/`multilineText` mit
  Längen nach XRechnung. Das Textschema zusätzlich um U+FFFE, U+FFFF und einzelne Surrogate
  erweitern (`!raw.isWellFormed()` bzw. `/[￾￿]/`), Befund B8. Leitweg-ID, USt-IdNr., IBAN
  und BIC mit Formatprüfung (IBAN mit Prüfziffer mod 97). Erzeugte XRechnungen der Golden-Fälle in
  CI mit dem KoSIT-Validator prüfen.
- Ort: `packages/shared/src/common.ts` (Funktion `text`), `packages/shared/src/invoices.ts` (neu),
  `apps/api/src/invoices/render/einvoice.ts` (neu), CI-Job in `.github/workflows/ci.yml`.
- Priorität: muss
- Test: `packages/shared/src/text.spec.ts`: "`Firma￿` und `Firma\uD800` ergeben text.controlChars";
  `apps/api/test/invoices/render.spec.ts` (neu): "Kundenname `</cbc:Name><cbc:ID>X</cbc:ID>` und `]]>`
  stehen als escapter Text im XML, das Dokument ist wohlgeformt und besteht die Schemaprüfung."

### I-02 XXE und Entity-Expansion beim Parsen (Information Disclosure, Denial of Service)

Im geplanten Ablauf parst die API kein XML. Das ändert sich, sobald jemand das erzeugte XML zur
Selbstprüfung parst oder E-Rechnungen empfangen werden.

- Maßnahme: Vor jedem Parsen `<!DOCTYPE` ablehnen. Parser ohne Entitäten und ohne Netz
  (libxmljs: `noent: false, nonet: true, dtdload: false`; fast-xml-parser: `processEntities: false`),
  Größenlimit, Parsen im Worker (D-02). Empfang fremder XML- oder ZUGFeRD-Dateien ist ein Upload
  und erst nach Entscheidung (Abschnitt 14, Punkt 1) zu bauen.
- Ort: wo immer ein Parser dazukommt; Abnahme durch security-auditor.
- Priorität: muss, sobald geparst wird
- Test: `apps/api/test/invoices/render.spec.ts`: "Eine XML-Eingabe mit
  `<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]>` wird vor dem Parsen mit 400 abgelehnt."

### I-03 CSV-Formel-Injection im Stundennachweis (Tampering)

- Maßnahme: Stundennachweis-CSV nur über `toCsv` (`apps/api/src/exports/csv.ts`); Projekt- und
  Aufgabennamen, Notizen sind Freitext. Befund B7: Texte, die vollständig
  `^-?\d+([.,]\d+)?$` entsprechen, bekommen kein Hochkomma, damit negative Beträge Zahlen bleiben.
  Alles andere mit führendem `= + - @ \t \r` weiter entschärfen.
- Ort: `apps/api/src/exports/csv.ts`.
- Priorität: muss
- Test: `apps/api/src/exports/csv.spec.ts`: "`-120,00` bleibt `-120,00`, `-1+1` und
  `=HYPERLINK(...)` bekommen das Hochkomma, ein Projektname `@SUM(A1)` erscheint als Text."

### I-04 Personaldaten im Stundennachweis für Kunden (Information Disclosure, Befund B9)

- Maßnahme: Eigener Export, nicht `timesheetRows`: nur Projektbuchungen des Kunden bzw. Projekts im
  Zeitraum, keine Abwesenheiten, keine Anwesenheitszeiten, keine Buchungen anderer Kunden. Ob
  Namen oder Kürzel der Beschäftigten erscheinen, ist offen (Abschnitt 14, Punkt 5).
- Ort: `apps/api/src/exports/` (neue Funktion), Route `POST /exports/project-timesheet` (neu),
  `@Roles('admin')`.
- Priorität: muss
- Test: `apps/api/test/exports/exports.int.spec.ts`: "Der Stundennachweis eines Kunden für einen Monat
  mit Krankmeldung enthält keine Abwesenheit und keine Buchung eines anderen Kunden."

### I-05 pdfkit liest Dateien oder erzeugt Links aus Daten (Information Disclosure)

`doc.font(src)` und `doc.image(src)` nehmen Dateipfade, `link` erzeugt beliebige URI-Aktionen.

- Maßnahme: Schrift einmal beim Start aus einem festen Pfad als Buffer laden, nie einen Pfad aus
  Daten übergeben. Kein Bild aus Nutzerdaten (kein Logo in Version 1). Keine Link-Annotationen mit
  Nutzer-URLs.
- Ort: `apps/api/src/invoices/render/pdf.ts` (neu), Schrift unter `apps/api/assets/fonts/` (neu).
- Priorität: muss
- Test: `apps/api/test/invoices/render.spec.ts`: "Ein Positionstext `/etc/passwd` erscheint wörtlich
  im PDF-Text, das PDF enthält keine /URI-Aktion."

### I-06 Zeichen außerhalb der Schrift: PDF zeigt etwas anderes als das XML (Tampering)

PDF/A verlangt eingebettete Schriften. Fehlt ein Glyph, steht im PDF ein Kästchen, im XML der
echte Text.

- Maßnahme: Eine eingebettete TTF mit bekannter Abdeckung (mindestens Latin-1, Latin Extended-A,
  Euro, typografische Anführungszeichen), Lizenz geprüft (checkliste Abschnitt 17). Rechnungs-
  Freitexte per zod auf diesen Zeichenvorrat begrenzen, dieselbe Grenze gilt fürs XML.
- Ort: `packages/shared/src/invoices.ts` (neu), `apps/api/assets/fonts/` (neu).
- Priorität: sollte
- Test: `apps/api/test/invoices/render.spec.ts`: "`Łódź` wird im PDF korrekt dargestellt, ein Name
  mit Zeichen außerhalb des Vorrats ergibt 400 mit Feldhinweis."

### I-07 Metadaten (Information Disclosure, Tampering)

- Maßnahme: Info-Dictionary und XMP nur mit Systemwerten: Titel "Rechnung <Nummer>", Autor
  Firmenname aus dem Snapshot. Keine E-Mail, keine UUID, keine interne ID. XMP nur über eine
  escapende Bibliothek erzeugen, nie per Verkettung.
- Ort: `apps/api/src/invoices/render/pdf.ts` (neu).
- Priorität: sollte
- Test: `apps/api/test/invoices/render.spec.ts`: "Firmenname `Müller & <Söhne>` ergibt wohlgeformtes
  XMP; das Info-Dictionary enthält weder `@` noch eine UUID."

### I-08 PDF und eingebettetes XML weichen ab (Tampering, Repudiation)

- Maßnahme: Ein berechnetes Rechnungsobjekt, zwei Renderer. Golden-Tests vergleichen Summen im XML,
  im Snapshot und im PDF-Text. PDF/A-3 in CI mit veraPDF prüfen.
- Ort: `apps/api/test/invoices/golden/` (neu), CI.
- Priorität: sollte
- Test: "Für jede Golden-Rechnung stimmen Netto, Steuer je Satz und Brutto in XML, Snapshot und PDF-Text überein."

### I-09 Lieferkette pdfkit und `@e-invoice-eu/core` (Tampering, Elevation)

- Maßnahme: Nur den JSON-Eingang der Bibliothek nutzen. Wege über Tabellendateien, YAML-Mappings
  oder LibreOffice (falls die eingesetzte Version sie anbietet) nicht verwenden, LibreOffice nicht
  ins Image. Welche PDF-Bibliothek intern für PDF/A-3 läuft und ob sie gepflegt ist, vor dem Einbau
  prüfen, ebenso die Lizenz. `pnpm audit --prod`, `minimumReleaseAge` (checkliste Abschnitt 17 offen),
  Versionen gepinnt.
- Ort: `apps/api/package.json`, `pnpm-workspace.yaml`, `apps/api/Dockerfile`.
- Priorität: sollte
- Test: CI: "`pnpm audit --prod` ohne hohe Befunde; im API-Image gibt es kein `soffice`."

## 10. K5: Last und Missbrauch

### D-01 Dateigröße und Seitenzahl (Denial of Service)

- Maßnahme: Höchstens 500 Positionen je Entwurf, Längen je Feld (Positionstext 1000 Zeichen),
  Stundennachweis höchstens 366 Tage (`inRange` in `packages/shared/src/common.ts`) und 5000
  Buchungen, nach dem Rendern höchstens 50 Seiten, Dokument höchstens 5 MB (Check in der DB, R-07).
  Das Body-Limit von 100 kB (`apps/api/src/app.ts`) begrenzt Eingaben zusätzlich.
- Ort: `packages/shared/src/invoices.ts` (neu), `apps/api/src/invoices/render/` (neu), Migration.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Ein Entwurf mit 501 Positionen ergibt 400,
  ein Stundennachweis über 367 Tage 400, ein Dokument über 5 MB weist die DB mit 23514 ab."

Nachtrag 02.10.2026: Umgesetzt sind höchstens 500 Positionen und 5000 Buchungen je Rechnung
(`MAX_LINES` und `MAX_ENTRIES` in `apps/api/src/invoices/invoices.service.ts`). Die Buchungsgrenze
prüfen Anlegen, Aktualisieren und Ausstellen eines Entwurfs, jeweils mit 400 und
`invoice.tooManyEntries`. `app.issue_invoice` weist eine Rechnung mit mehr als 5000 Buchungen
zusätzlich mit 23514 ab (`20260926001304_invoice_entry_limit.sql`). Ein Stundennachweis-PDF nimmt
höchstens 1800 Buchungen (`MAX_REPORT_ENTRIES`), für mehr bleibt die CSV.

Vorprüfung vor der Nummernvergabe: Vor der Transaktion mit `app.issue_invoice` rendert die API das
PDF des Entwurfs einmal im Worker, ohne es zu speichern. Läuft es über 50 Seiten, antwortet
`POST /invoices/:id/issue` mit 422 `PAGE_LIMIT`, eine Nummer wird nicht verbraucht. Eine Prüfung
nur über Zählgrenzen ist verworfen: Die Seitenzahl hängt an den Textlängen, schon 80 Positionen
mit je 1000 Zeichen laufen über 50 Seiten, und eine Grenze, die das sicher ausschließt, träfe
gewöhnliche Rechnungen. Der Probelauf zählt richtig, weil Entwurf und ausgestellte Rechnung
denselben Textfluss haben; Nummer, Datum, Wasserzeichen und Fußzeile stehen an festen Stellen.
Ändert sich der Entwurf zwischen Probelauf und Ausstellung, antwortet die API mit 409
`INVALID_STATE`, weil sie das Rechnungsmodell in der Ausstellungstransaktion unter Sperre mit dem
geprüften vergleicht.

Der Probelauf geht durch dieselbe Render-Warteschlange wie die Vorschau. Ist sie voll, antwortet
das Ausstellen mit 503 `RENDER_BUSY` und `Retry-After`, ebenfalls ohne Nummer. Ausstellen ohne
Warteschlange gilt damit nur noch für die Stornierung, deren Positionen schon einmal in 50 Seiten
gepasst haben. Hingenommen, weil Live und Demo getrennte Prozesse mit eigener Warteschlange sind
und Live nur Eingeladenen offensteht. Ein Probelauf an der Warteschlange vorbei ist verworfen: Dann
könnte jede Ausstellung einen eigenen Worker mit bis zu 128 MB starten, und in der Demo hat jeder
Besucher eine Admin-Persona.

- Test: `apps/api/src/documents/pdf.spec.ts`: "runs a draft over exactly as many pages as the
  invoice it becomes"; `apps/api/test/invoices/render-limits.int.spec.ts`: "are counted before the
  number goes out, a draft past 50 pages stays a draft"; `apps/api/test/invoices/acceptance.int.spec.ts`:
  "refuses a draft that changed while its pages were counted", "spends no number on an issue while
  the queue is too full for the page check", "5000 bookings per invoice";
  `apps/api/test/db/invoice-hardening.int.spec.ts`: "issues 5000 and refuses the 5001st without
  spending a number".

### D-02 Rechenzeit der PDF-Erzeugung (Denial of Service, Befund B10)

pdfkit rechnet im Event-Loop. Mit einem API-Container blockiert ein langes Dokument alle Anfragen.

- Maßnahme:
  1. Rendern in `node:worker_threads` mit `resourceLimits` und Abbruch nach 5 s.
  2. Höchstens 2 gleichzeitige Renderings je Prozess, Warteschlange 10, danach 503 mit `Retry-After`.
  3. Nie innerhalb einer DB-Transaktion rendern: kurze Transaktion für die Ausstellung (Nummer,
     Snapshot, Sperren), dann rendern, dann eigene Transaktion für das Dokument. Fehlt ein Dokument,
     wird es aus dem Snapshot nachgerendert.
  4. Ausgestellte Dokumente werden beim Download aus der DB geliefert, nicht neu gerendert.
  5. Limit je Nutzer über einen Guard auf Routenebene, weil der globale `ThrottlerGuard` vor dem
     `SessionGuard` läuft und `request.auth` dort noch fehlt.
- Ort: `apps/api/src/invoices/render/worker.ts` (neu), `apps/api/src/common/render-limit.guard.ts`
  (neu, genutzt von Vorschau, Ausstellung und Stundennachweis).
- Priorität: muss
- Test: `apps/api/test/invoices/render.int.spec.ts` (neu): "Während zehn Vorschauen laufen, antwortet
  GET /health unter 200 ms; die elfte gleichzeitige Vorschau ergibt 503 mit Retry-After."

### D-03 Entwurfsvorschau als echte Rechnung verwenden (Spoofing, Repudiation)

Eine Vorschau ohne Nummer, die an einen Kunden geht, ist ein Beleg ohne Aufzeichnung.

- Maßnahme: Vorschau-PDFs tragen auf jeder Seite "Entwurf – keine Rechnung", keine Nummer, kein XML
  für Entwürfe, werden nicht gespeichert.
- Ort: `apps/api/src/invoices/render/pdf.ts` (neu).
- Priorität: muss
- Test: `apps/api/test/invoices/render.spec.ts`: "Jede Seite einer Vorschau enthält den Text „Entwurf –
  keine Rechnung", die Vorschau enthält kein Nummernfeld."

### Rate-Limits (Vorschlag)

Globales Limit bleibt 300/min je IP. "Nutzer" heißt Zählung je `userId` über den Guard aus D-02.

| Route (neu)                             | Live                           | Demo                                                                          | Zählung |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ------- |
| POST `/invoice-drafts/:id/preview`      | 20/min                         | 10/min, 100/Tag je Sandbox                                                    | Nutzer  |
| POST `/invoice-drafts/:id/issue`        | 30/h                           | Kontingent 30 je Sandbox (X-03)                                               | Nutzer  |
| POST `/invoices/:id/cancel`             | 10/h                           | 10/h                                                                          | Nutzer  |
| POST `/invoices/:id/payments`           | 30/min                         | 30/min                                                                        | Nutzer  |
| GET `/invoices/:id/documents/:kind`     | global                         | global                                                                        | IP      |
| POST `/exports/project-timesheet` (PDF) | 20/min                         | 10/min                                                                        | Nutzer  |
| POST `/exports/project-timesheet` (CSV) | 30/min                         | 30/min                                                                        | Nutzer  |
| POST `/timer/start`, `/timer/stop`      | 30/min                         | 30/min                                                                        | Nutzer  |
| PATCH `/billing/profile`                | 10/h                           | 10/h, in einer Sandbox nur `taxProfile` und `previousYearRevenueCents` (X-02) | Nutzer  |
| PUT `/invoice-series/:series/start`     | 5/h                            | Demo 404                                                                      | Nutzer  |
| Renderings gleichzeitig                 | 2 je Prozess, Warteschlange 10 | wie Live                                                                      | Prozess |

## 11. K3: Timer, Projektzeiten, Rundung

### T-01 Zeit per Client-Uhr setzen (Tampering)

- Maßnahme: `POST /timer/start` und `/timer/stop` nehmen `emptyBodySchema`
  (`packages/shared/src/common.ts`). Guard-Trigger auf `app.project_entries` nach dem Muster von
  `app.guard_time_entry()`: bei `source = 'timer'` muss `started_at = now()` beim INSERT und
  `ended_at = now()` beim Stoppen sein. Die Oberfläche rechnet die laufende Dauer aus dem
  `startedAt` des Servers und einer Serverzeit in der Antwort, nicht aus der Geräteuhr.
- Ort: Migration `20260926000000_projects.sql`, `apps/api/src/projects/timer.controller.ts` (neu).
- Priorität: muss
- Test: `apps/api/test/db/projects.int.spec.ts`: "insert mit source = 'timer' und started_at = now() -
  interval '1 hour' ergibt 23514; POST /timer/stop mit endedAt im Body ergibt 400."

### T-02 Timer läuft über Tage (Tampering)

- Maßnahme: Partieller Unique-Index "ein laufender Timer je Person" (`where ended_at is null`).
  Buchungen über 12 h gelten als `needs_review` und kommen erst nach Bestätigung oder Kürzung in
  einen Entwurf. Manuelle Buchungen per Check höchstens 24 h. Hinweis in der Oberfläche ab 10 h.
- Ort: Migration, `apps/api/src/invoices/invoices.service.ts` (neu), Web.
- Priorität: muss (Index, Ausschluss aus Entwürfen), sollte (Hinweis)
- Test: `apps/api/test/db/projects.int.spec.ts`: "Ein zweiter Start bei laufendem Timer ergibt 409;
  eine 30-h-Buchung erscheint nicht im Entwurf, bis sie bestätigt ist."

Nachtrag 02.10.2026: Umgesetzt als Sperre beim Ausstellen, nicht als Ausschluss aus dem Entwurf.
Ein Timer-Eintrag ab 12 h (`longTimerEntries` in `packages/rules/src/billing/long-entries.ts`)
kommt in den Entwurf und setzt den Hinweis `long_timer_entry`. `POST /invoices/:id/issue`
verweigert dann mit 409 `INVALID_STATE` und dem Blocker `long_timer_entry`, solange der Body nicht
`longTimersChecked: true` trägt; der Ausstellen-Dialog fragt das mit einem Kontrollkästchen ab.
Stimmt die Zeit nicht, wird der Entwurf verworfen, die Buchung korrigiert und der Entwurf neu
angelegt. Ein Ausschluss bräuchte eine gespeicherte Bestätigung je Buchung und einen eigenen
Hinweis auf ausgelassene Zeit, sonst fehlte sie still in der Rechnung. Lange manuelle Buchungen
gelten als gewollt.

- Test: `apps/api/test/invoices/acceptance.int.spec.ts`: "hints once at timer entries of twelve
  hours and more, never at long manual ones"; `apps/web/src/features/billing/issue-dialog.spec.tsx`:
  "asks to confirm a timer of twelve hours and more before the number goes out".

### T-03 Überlappende Projektzeiten (Tampering)

Dieselbe Stunde an zwei Kunden abrechnen.

- Maßnahme: `EXCLUDE USING gist (employee_id WITH =, tstzrange(started_at, ended_at, '[)') WITH &&)
WHERE (voided_at IS NULL)` wie auf `app.time_entries`.
- Ort: Migration `20260926000000_projects.sql`.
- Priorität: muss
- Test: `apps/api/test/db/projects.int.spec.ts`: "Eine manuelle Buchung, die einen bestehenden
  Timer-Zeitraum überlappt, ergibt 409 TIME_OVERLAP."

### T-04 Manuelle Zeiten in Zukunft, gesperrten Monaten, abgerechneten Zeiträumen (Tampering)

- Maßnahme: Trigger prüft `ended_at <= now()`. Im Betrieb `app.enforce_period_lock('workday')` auf
  `app.project_entries`. Abrechnungssperre aus R-09.
- Ort: Migration.
- Priorität: muss
- Test: `apps/api/test/db/projects.int.spec.ts`: "Eine Buchung mit Ende morgen ergibt 400, eine im
  abgeschlossenen Monat 409 PERIOD_LOCKED."

### T-05 Projektzeit außerhalb der Arbeitszeit im Betrieb (Tampering)

- Maßnahme: Projektminuten je Person und Tag höchstens die gearbeiteten Minuten, geprüft in
  `@zeit/rules` und im Service bei der Zuordnung, dazu ein Punkt auf der Monatsabschluss-Checkliste.
- Ort: `packages/rules/src/billing/` (neu), `apps/api/src/months/`.
- Priorität: sollte
- Test: `apps/api/test/db/projects.int.spec.ts`: "9 h Zuordnung an einem Tag mit 8 h Arbeitszeit ergibt
  409 INVALID_STATE."

### T-06 Rundungsmissbrauch (Tampering)

Angriff: Zehn Buchungen zu je einer Minute, jede auf 15 Minuten aufgerundet, ergeben 150 Minuten.

- Maßnahme: Gerundet wird die Summe je Position, nie die einzelne Buchung. Rechenkern als reine
  Funktion in `packages/rules/src/billing/` (neu), Geld in ganzen Cent bzw. exakt, nie `number` mit
  Nachkommastellen. Check auf `app.invoice_lines`: `net_amount = round(quantity * unit_price, 2)`.
  `app.invoice_issue` rechnet die Summen nach. Rundungsregel und Schritt stehen im Snapshot; neben
  der abgerechneten Menge steht die exakte Minutenzahl. Rundung je Position vs. Gesamtbetrag ist
  mit Steuerberatung zu klären (`docs/rechnungen-recht.md`, offener Punkt 1).
- Ort: `packages/rules/src/billing/` (neu), Migration.
- Priorität: muss
- Test: `packages/rules/src/billing/index.spec.ts` (neu, fast-check): "Das Aufteilen einer Buchung in
  beliebig viele Teilbuchungen ändert abgerechnete Minuten und Betrag nicht; Aufrunden fügt je
  Position höchstens Schritt minus 1 Minuten hinzu."

### T-07 Stundensatz rückwirkend ändern (Tampering)

- Maßnahme: `app.rates` append-only mit `valid_from`; ein Satz gilt ab seinem Datum. Ausgestellte
  Rechnungen tragen den Satz im Snapshot. Welcher Stichtag gilt (Leistungsdatum oder
  Rechnungsdatum), ist offen (Abschnitt 14, Punkt 8).
- Ort: Migration `20260926000000_projects.sql`.
- Priorität: sollte
- Test: `apps/api/test/db/projects.int.spec.ts`: "Ein neuer Satz ab gestern ändert keine ausgestellte
  Rechnung und in einem offenen Entwurf nur die Buchungen ab gestern."

## 12. Datenschutz, Aufbewahrung, Protokoll, Step-up

### P-01 Personenbezogene Daten in Rechnungen

Betroffen: Kunden als natürliche Personen (B2C), Ansprechpartner, die Freelancerin selbst (die
Geschäftsanschrift ist oft die Wohnanschrift), Beschäftigte im Stundennachweis, IBAN.
Rechtsgrundlagen: Art. 6 Abs. 1 lit. b DSGVO (Vertrag), lit. c (Aufbewahrung nach § 147 AO,
§ 257 HGB), bei Beschäftigten § 26 BDSG.

- Maßnahme: Eintrag im Verzeichnis der Verarbeitungstätigkeiten (checkliste Abschnitt 20);
  Datenminimierung je Feld (keine Geburtsdaten, keine privaten Telefonnummern im Kundenstamm);
  pino loggt keine Bodies und keine Dokumente (`apps/api/src/common/logging.ts` prüfen);
  Fehlermeldungen aus pdfkit oder `@e-invoice-eu/core` gehen ohne Inhalt ins Log.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Nach einer Ausstellung enthält das
  mitgeschnittene Log weder Kundennamen noch IBAN."

### P-02 Aufbewahrung gegen Löschung

- Maßnahme: `retain_until = make_date(extract(year from issue_date)::int + 8, 12, 31)` in
  `app.invoice_issue`. In Version 1 gibt es keinen Löschweg für Rechnungen. Kunden mit Rechnungen
  werden archiviert (`archived_at`, Einschränkung nach Art. 18 DSGVO: aus Listen und Auswahl
  verschwunden, im Archiv und Export sichtbar), Kunden ohne Rechnung dürfen gelöscht werden.
  Live-Mandanten sind nicht löschbar (R-04). Löschpfad für Zeitbuchungen erst nach Klärung
  (`docs/rechnungen-recht.md`, offener Punkt 4). Sandbox-Daten gehen nach 24 h komplett, das ist
  zulässig, weil dort keine echten Rechnungen entstehen (X-01).
- Ort: Migrationen, `apps/api/src/projects/` (neu).
- Priorität: muss
- Test: `apps/api/test/db/invoices.int.spec.ts`: "DELETE auf einen Kunden mit Rechnung ergibt 409
  INVALID_STATE (23503), Archivieren gelingt; retain_until einer Rechnung vom 15.03.2026 ist der
  31.12.2034."

### P-03 Protokoll bei Ausstellung, Storno, Zahlungsstatus (Repudiation)

- Maßnahme: `audit.track()` auf jeder neuen Tabelle. Neuer Meta-Test: jede Tabelle in `app` hat einen
  Trigger `audit_<tabelle>` (gibt es heute nicht). App-Ereignisse mit IP für Ausstellung, Storno,
  Stammdatenwechsel innerhalb derselben `withTenant`-Transaktion schreiben, nicht über
  `Audit.record` (Befund B4). `audit.track()` überspringt `body` und `snapshot` (Befund B5), damit
  weder PDF noch Adressblock im append-only Protokoll landen.
- Ort: Migrationen, darin `create or replace function audit.track()`,
  `apps/api/test/db/journals.int.spec.ts`.
- Priorität: muss
- Test: `apps/api/test/db/journals.int.spec.ts`: "Jede Tabelle in app hat einen audit-Trigger; das
  Einfügen eines Dokuments erzeugt einen Eintrag ohne Feld body, kleiner als 2 kB."

| Ereignis                                    | Quelle                                                       | Inhalt                                                                |
| ------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Rechnung ausgestellt                        | Trigger auf `app.invoices` + App-Ereignis mit IP             | Nummer, Art, Summen, `customer_id`, Leistungszeitraum, `content_hash` |
| Stornorechnung                              | Trigger + App-Ereignis mit IP                                | Storno-Nummer, Bezug, Grund                                           |
| Dokument gespeichert                        | Trigger auf `app.invoice_documents`                          | Art, sha256, Größe                                                    |
| Zahlung erfasst oder zurückgebucht          | Trigger auf `app.invoice_payments`                           | Betrag, Datum, Methode, Grund                                         |
| Rechnungsstammdaten geändert                | Trigger + App-Ereignis mit IP                                | geänderte Felder, IBAN nur letzte vier Stellen                        |
| Nummernkreis-Startwert                      | Trigger auf `app.invoice_counters` über die Definer-Funktion | Serie, Jahr, Startwert                                                |
| Satz angelegt                               | Trigger auf `app.rates`                                      | Projekt/Aufgabe, Satz, gültig ab                                      |
| Projektbuchung durch andere Person geändert | Trigger, `subject_employee_id` gesetzt                       | Diff                                                                  |
| Kunde archiviert oder gelöscht              | Trigger                                                      | beim Löschen nur die ID (P-05)                                        |

### P-04 HR liest Rechnungsdaten im Protokoll (Information Disclosure, Befund B6)

- Maßnahme: Policy "hr and admins read the trail" so ändern, dass `hr` Einträge der Tabellen
  `invoices`, `invoice_lines`, `invoice_payments`, `invoice_documents`, `rates`, `customers`,
  `billing_profiles` nicht liest.
- Ort: Migration `20260926000100_invoices.sql`.
- Priorität: sollte
- Test: `apps/api/test/audit/audit.int.spec.ts`: "Als hr liefert GET /audit?table=invoices keine
  Einträge, als admin die Ausstellung."

### P-05 Gelöschte Kunden leben im Protokoll weiter (Information Disclosure)

`audit.track()` schreibt beim DELETE die alte Zeile ins Diff; das Protokoll wird nie gelöscht.

- Maßnahme: Für `customers` beim DELETE nur die ID protokollieren. Langfristig ein Löschweg für
  Protokolleinträge nach Ablauf der längsten Aufbewahrungsfrist, als Definer-Funktion mit eigener
  Protokollzeile.
- Ort: `audit.track()` per Migration.
- Priorität: sollte
- Test: `apps/api/test/db/journals.int.spec.ts`: "Nach dem Löschen eines Kunden ohne Rechnung enthält
  audit.log keinen Namen und keine Anschrift dieses Kunden."

### Step-up (Vorschlag)

Mechanik wie im Bestand: `@RequireReauth()`, 10 min (`apps/api/src/common/reauth.guard.ts`), in der
Demo ausgesetzt.

| Aktion                                                                                              | Step-up                                                           | Priorität | Grund                                                                            |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| Rechnungsstammdaten ändern (Firma, Anschrift, Steuernummer, USt-IdNr., IBAN, BIC, Kleinunternehmer) | ja, dazu Info-Mail                                                | muss      | Ein IBAN-Tausch leitet Zahlungen um, die Identität steht auf jedem Beleg         |
| Stornorechnung erstellen                                                                            | ja                                                                | muss      | unumkehrbar, hebt Umsatz auf                                                     |
| Nummernkreis-Startwert oder Präfix setzen                                                           | ja                                                                | muss      | einmalig, prägt die Nummernfolge                                                 |
| Komplett-Export aller Rechnungen und Kunden (falls gebaut)                                          | ja                                                                | muss      | checkliste Abschnitt 8                                                           |
| Kunde löschen oder archivieren                                                                      | ja                                                                | sollte    | Löschung ist unumkehrbar                                                         |
| Rechnung ausstellen                                                                                 | nein, Bestätigung mit Empfänger, Summe und "Nummer wird vergeben" | –         | häufig; Missbrauch erzeugt nur stornierbare Belege, das System verschickt nichts |
| Zahlung erfassen oder zurückbuchen                                                                  | nein                                                              | –         | append-only und protokolliert                                                    |
| Satz anlegen, Rundungsregel ändern                                                                  | nein                                                              | –         | protokolliert, wirkt nur auf Entwürfe                                            |
| Timer, Projektbuchungen                                                                             | nein                                                              | –         | Routine                                                                          |

## 13. K7: Demo

### X-01 Echte Rechnung aus der Demo (Spoofing, Repudiation)

- Maßnahme: `app.invoice_issue` setzt `specimen = true`, wenn `app.tenants.kind = 'sandbox'`, und
  sonst nie. Die Entscheidung hängt an der Datenbank, nicht an `APP_MODE`, damit auch eine falsch
  konfigurierte Instanz keine echte Rechnung aus einer Sandbox erzeugt. Bei `specimen`:
  Nummer mit Präfix `MUSTER-`, jede PDF-Seite mit dem diagonalen Text "Musterrechnung – keine
  Rechnung im Sinne des § 14 UStG", im XML dieselbe Aussage als Rechnungshinweis (BT-22).
  Verkäufer ist der erfundene Musterbetrieb mit einer USt-IdNr., die die deutsche Prüfziffer nicht
  besteht, und einer IBAN mit falscher Prüfziffer, damit weder Steuerabzug noch Überweisung
  funktionieren.
- Ort: `app.invoice_issue`, `apps/api/src/invoices/render/` (neu), `packages/demo-data`.
- Priorität: muss
- Test: `apps/api/test/invoices/render.spec.ts`: "Jede in einer Sandbox ausgestellte Rechnung hat
  specimen = true, eine Nummer mit MUSTER- und den Hinweistext auf jeder Seite und im XML; in einem
  Live-Mandanten ist specimen nie gesetzt."

### X-02 Echte Firmendaten in der Demo (Spoofing)

- Maßnahme: In einer Sandbox (`tenants.kind = 'sandbox'`) nimmt `PATCH /billing/profile` nur
  `taxProfile` und `previousYearRevenueCents` an, damit sich die Kleinunternehmerregel ausprobieren
  lässt. Jedes andere geänderte Feld ergibt 403 `FORBIDDEN` mit den Feldnamen in `details.fields`,
  das Profil bleibt dann unverändert. Die übrigen Stammdaten kommen fest aus dem Generator. Die
  Prüfung hängt an `tenants.kind`, nicht an `APP_MODE`; Live-Mandanten sind nicht berührt. Limit
  10/h je Nutzer wie im Live-Betrieb. Damit kann niemand ein Dokument im Namen einer echten Firma
  erzeugen. Kunden bleiben bearbeitbar; der Demo-Banner sagt "Keine echten Daten eingeben", alles
  verschwindet nach 24 h.
- Ort: `apps/api/src/billing/billing.service.ts` (`SANDBOX_FIELDS`),
  `apps/api/src/billing/billing.controller.ts`, Web-Banner.
- Priorität: muss
- Test: `apps/api/test/billing/billing.int.spec.ts`: "In einer Sandbox gelingt der Wechsel von
  Steuerprofil und Vorjahresumsatz, IBAN, Anschrift, Kontakt-E-Mail, Steuernummer und Präfix ergeben
  403 mit `details.fields`; ein Live-Mandant ändert seine Stammdaten frei; die elfte Änderung
  innerhalb einer Stunde ergibt 429 mit `Retry-After`."

### X-03 Spam-PDFs und Speicher in Sandboxes (Denial of Service)

- Maßnahme: Kontingente je Sandbox per Trigger (`kind = 'sandbox'`): 30 Rechnungen, 50 Entwürfe,
  500 Projektbuchungen, 50 Kunden, Fehler `SANDBOX_LIMIT` (gibt es schon in
  `packages/shared/src/errors.ts`). Render-Limits aus Abschnitt 10. Summe aller Dokumente je
  Sandbox höchstens 20 MB. Mit höchstens 300 aktiven Sandboxes sind das im ungünstigsten Fall 6 GB,
  der Purge alle 15 min räumt ab.
- Ort: Migration `20260926000100_invoices.sql`.
- Priorität: muss
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "Die 31. Ausstellung in einer Sandbox ergibt
  SANDBOX_LIMIT, in einem Live-Mandanten nicht."

## 14. Offene Punkte

Diese Punkte verändern Maßnahmen und sind vor dem Bau mit Leon zu klären.

1. E-Rechnungs-Empfang: `docs/rechnungen-recht.md` führt ihn unter "Muss in Version 1", der feste
   Plan und die checkliste ("keine Datei-Uploads") nicht. Mit Empfang kommen Upload, XML-Parser und
   PDF-Parser dazu (I-02) und ein eigenes Bedrohungsmodell.
2. Wer lädt Freelancer ein: Betreiber per CLI (angenommen) oder ein Betriebs-Admin über die API. Das
   Zweite widerspricht M-03 und braucht eine Definer-Funktion mit eigener Freigabe.
3. Freelancer-Persona: eigener Solo-Sandbox-Mandant (dann M-05) oder Persona im Musterbetrieb.
4. Rollen für Rechnungen im Betrieb: nur `admin` (angenommen) oder auch `hr`.
5. Namen der Beschäftigten im Stundennachweis für Kunden: voller Name, Kürzel oder abschaltbar.
6. Zeichenvorrat der Rechnungsschrift (I-06).
7. Rundung je Position oder auf den Gesamtbetrag (`docs/rechnungen-recht.md`, offener Punkt 1).
8. Stichtag des Stundensatzes: Leistungsdatum oder Rechnungsdatum.
9. Aufbewahrung der Zeitbuchungen hinter Rechnungen (`docs/rechnungen-recht.md`, offener Punkt 4).

## 15. Die zehn wichtigsten Maßnahmen

1. Ausgestellte Rechnungen, Positionen und Dokumente in eigenen Tabellen ohne INSERT, UPDATE,
   DELETE und TRUNCATE für `zeit_app`; Ausstellung nur über `app.invoice_issue` mit Serverdatum,
   serverseitigen Summen und Snapshot (R-01, R-02, R-06, N-03).
2. Nummernvergabe per Zähler-Upsert in derselben Transaktion, Unique-Constraints, Test mit 20
   parallelen Ausstellungen (N-01, N-02).
3. Purge-Ausnahme gegen `zeit_app` absichern und Live-Mandanten unlöschbar machen (R-03, R-04).
4. Abrechnungssperre über `app.invoice_entries` mit partiellem Unique-Index und Sperr-Triggern;
   Storno nur über `app.invoice_cancel` mit Step-up (R-08, R-09).
5. Mandantentyp unveränderlich, keine Solo-Ausnahmen in bestehenden Guards, Ein-Personen-Trigger
   mit Advisory-Lock (M-01, M-02).
6. Neue Tabellen im RLS-Meta-Test und in der Rollen-Matrix, Sätze und Rechnungen nur `admin`,
   Definer-Funktionen filtern selbst nach Mandant, Step-up für Rechnungsstammdaten und IBAN
   (Z-01, Z-02, Abschnitt 12).
7. Rendern im Worker mit Zeit-, Seiten-, Größen- und Parallelitätsgrenze, nie innerhalb einer
   DB-Transaktion, Limits je Nutzer über einen Guard auf Routenebene (D-01, D-02).
8. XML nur über den Builder, Textschema um U+FFFE, U+FFFF und Surrogate erweitert, CSV über
   `toCsv` mit Ausnahme für Dezimalzahlen, Stundennachweis ohne HR-Daten (I-01, I-03, I-04).
9. Timer nur mit DB-Zeit, EXCLUDE gegen Überlappung, Rundung auf Positionsebene mit
   Property-Tests (T-01, T-03, T-06).
10. Demo: `specimen` aus `tenants.kind`, Wasserzeichen, `MUSTER-`-Präfix, ungültige USt-IdNr. und
    IBAN, gesperrte Rechnungsstammdaten, Kontingente je Sandbox (X-01 bis X-03).
