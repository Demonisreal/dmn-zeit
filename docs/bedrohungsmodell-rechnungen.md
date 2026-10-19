# Bedrohungsmodell: Projekte, Solo-Bereich und Rechnungen

Stand 24.09.2026. Grundlage: `docs/architecture.md`, `docs/rechnungen-recht.md`,
`db/schema.sql` und `db/migrations/`, `apps/api/src/common`, `apps/api/src/auth`,
`apps/api/src/exports`, `apps/api/src/tenant`, `apps/api/src/db`, `deploy/*/compose.yml`.

Gegenstand ist die Erweiterung: Kunden, Projekte, Aufgaben, Stundensätze, Timer und
manuelle Projektzeiten, im Betrieb die Aufteilung der Arbeitszeit auf Projekte; Solo-Mandant für
Freelancer; Rechnungen nach § 14 UStG mit fortlaufender Nummer, Unveränderbarkeit, Storno,
Abrechnungssperre und Zahlungsstatus; PDF (pdfkit), E-Rechnung (XRechnung/ZUGFeRD über
`@e-invoice-eu/core`, PDF/A-3 mit eingebettetem XML); Stundennachweis als PDF und CSV;
Freelancer-Persona in der Demo.

Nachtrag 25.09.2026: Entschieden wurde, dass im Betrieb HR und Administration Rechnungen ausstellen und stornieren (beide mit Step-up); wo unten "nur `admin`" steht, gilt "HR und Admin". In der Umsetzung gilt: Rendern nach dem Commit im Worker (D-02 umgesetzt), Muster-Kennzeichnung der Demo nach X-01 übernommen.

Umsetzungsstand am 19.10.2026 gegen Code und Tests abgeglichen. Jede Maßnahme trägt eine Zeile
"Status": umgesetzt (mit dem Test, der sie belegt), teilweise umgesetzt (mit dem, was fehlt), offen
(geplant, nicht gebaut) oder nicht umgesetzt (bewusst anders gelöst oder verworfen, mit Begründung).
Wo die Umsetzung vom ursprünglichen Entwurf abweicht, steht die Abweichung in der Maßnahme selbst.

## 1. Annahmen

Diese Annahmen stecken im Modell. Wo eine davon nicht stimmt, ändern sich die betroffenen
Maßnahmen (siehe Abschnitt 14).

1. Mandanten legt weiterhin nur die CLI an (`docs/architecture.md`, "Settled decisions": "Tenants are created only by the CLI in the
   API image"). "Solo nur auf Einladung durch Admin" heißt: der Betreiber legt den
   Solo-Mandanten per CLI an und verschickt die Einladung, kein Betriebs-Admin über die API.
2. Eine Person gehört genau einem Mandanten (`app.users.email` bleibt global eindeutig), es gibt
   keinen Mandantenwechsel innerhalb einer Sitzung.
3. Das System verschickt Rechnungen nicht selbst per Mail. Die Nutzerin lädt PDF/XML herunter.
4. In Version 1 gibt es keinen Upload (kein Logo, keine Anhänge, kein Empfang fremder
   E-Rechnungen). `docs/rechnungen-recht.md` führt den E-Rechnungs-Empfang allerdings unter
   "Muss in Version 1"; das ist ein offener Widerspruch (Abschnitt 14, Punkt 1).
5. Rechnungen, Kunden, Sätze und Zahlungen sind im Betrieb HR und Administration vorbehalten
   (zunächst war nur `admin` vorgesehen, siehe Nachtrag vom 25.09.2026); die Rechnungsstammdaten
   ändert nur `admin`. Im Solo-Mandanten ist die eine Person `admin`.
6. Dokumente (PDF, XML) liegen als `bytea` in der Datenbank, nicht im Dateisystem. Der API-Container
   läuft `read_only` (`docs/architecture.md`, "Operations details"), ein Volume für Dateien wäre eine neue Angriffsfläche.

## 2. Systembild und Vertrauensgrenzen

| Nr. | Komponente                                                           | Vertrauensgrenze davor                                                                                                           |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| K1  | SPA (Vite/React)                                                     | Browser des Nutzers, nicht vertrauenswürdig                                                                                      |
| K2  | API-Module `projects`, `invoices`, `billing`, `documents`, `exports` | Caddy -> API, Guards `Throttler -> Session -> Csrf -> Enrollment -> Workspace -> Roles -> Reauth` (`apps/api/src/app.module.ts`) |
| K3  | Tabellen in `app`, RLS mit RESTRICTIVE-Zaun + FORCE                  | API als `zeit_app`, setzt den Kontext selbst per `set_config`                                                                    |
| K4  | SECURITY-DEFINER-Funktionen im Besitz von `zeit_system` (BYPASSRLS)  | `zeit_app` -> `zeit_system`, hier endet der RLS-Schutz                                                                           |
| K5  | Renderer: pdfkit, `@e-invoice-eu/core`, im Worker-Thread             | Nutzertext -> Dokument, das den Betrieb verlässt (Kunde, Finanzamt)                                                              |
| K6  | Exporte: Stundennachweis PDF/CSV                                     | Nutzertext -> Tabellenkalkulation beim Empfänger                                                                                 |
| K7  | Demo-Sandbox, Freelancer-Persona                                     | anonyme Besucher                                                                                                                 |
| K8  | Betrieb: `zeit_owner`, Superuser, Backup, Restore                    | außerhalb der App, nur Erkennung möglich                                                                                         |

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

Die Befunde beschreiben den Bestand vor der Erweiterung. Der Stand der Behebung steht jeweils in
der letzten Zeile.

- **B1 Purge-Ausnahme über einen frei setzbaren GUC.** `app.reject_change()` und
  `app.guard_time_entry()` (beide in `db/schema.sql`) lassen DELETE zu, wenn
  `current_setting('zeit.purge_tenant')` die Mandanten-ID trägt. Platzhalter-GUCs mit Punkt darf
  jede Rolle setzen, also auch `zeit_app`. Heute harmlos, weil `zeit_app` auf den Journalen kein
  DELETE-Recht hat (Grants am Ende von `db/migrations/20260924000100_time.sql`, DELETE nur auf `team_leads`,
  `contracts`, `ops.rate_limits`). Bekommt `zeit_app` DELETE auf Entwürfe und liegen Entwurf und
  ausgestellte Rechnung in derselben Tabelle, löscht ein `set_config('zeit.purge_tenant', <eigener
Mandant>, true)` ausgestellte Rechnungen. Stand: behoben durch R-03.
- **B2 Kaskade beim Löschen eines Mandanten.** Alle Fremdschlüssel auf `app.tenants` stehen auf
  `ON DELETE CASCADE` (`db/schema.sql`, Abschnitt der Fremdschlüssel). Heute löscht nur `ops.purge_sandbox()`
  und nur Sandboxes. Für Rechnungen mit acht Jahren Aufbewahrungspflicht darf ein Live-Mandant nie
  per Kaskade verschwinden, auch nicht durch einen Handgriff mit Owner-Rechten. Stand: behoben
  durch R-04.
- **B3 `zeit_app` darf Live-Mandanten anlegen.** `grant select, insert, update on app.tenants`
  (`db/migrations/20260923000000_core.sql`) plus Policy "admins create the tenant", die nur
  `app.role() = 'admin'` prüft. Die CLI nutzte genau diesen Weg (`apps/api/src/cli/tenant-create.ts`).
  Ein kompromittierter API-Prozess kann damit beliebige Live- oder Solo-Mandanten erzeugen.
  Stand: behoben durch M-03.
- **B4 Protokoll außerhalb der Fachtransaktion.** `Audit.record` (`apps/api/src/common/audit.ts`)
  öffnet eine eigene Transaktion. Für Ausstellung und Storno muss der Eintrag in derselben
  Transaktion liegen, sonst gibt es Rechnungen ohne Protokoll oder Protokoll ohne Rechnung. Stand:
  behoben, die Rechnungs- und Profilereignisse schreiben `InvoicesStore.logEvent` und
  `BillingStore.logEvent` in der Transaktion der Fachänderung (P-03).
- **B5 `audit.track()` kopiert ganze Zeilen.** Das Diff enthielt jede Spalte außer `updated_at` und
  `last_login_at`. Ein PDF als `bytea` landet damit hexkodiert im append-only `audit.log`, ein
  Snapshot mit Anschrift ebenso, und das Protokoll wird nie gelöscht. Stand: behoben, die Funktion
  lässt bei `invoices` die Spalten `seller` und `buyer` und bei `invoice_documents` die Spalte
  `content` aus (`db/migrations/20260926001000_invoice_audit_redaction.sql`, P-03).
- **B6 HR liest das ganze Protokoll.** Policy "hr and admins read the trail" gab `hr` alle
  Einträge des Mandanten, also künftig auch Diffs von Rechnungen, Sätzen und Kunden, obwohl diese
  nur `admin` sehen soll. Stand: behoben durch P-04.
- **B7 CSV-Schutz trifft negative Dezimalzahlen als Text.** `toCsv` stellte jedem Text mit
  führendem `-` ein Hochkomma voran (`apps/api/src/exports/csv.ts`). Beträge laufen im deutschen
  Format als Text. Ein Storno-Betrag `-120,00` käme als `'-120,00` an und wäre in der Tabelle keine
  Zahl mehr. Stand: behoben durch I-03.
- **B8 Textschema lässt in XML verbotene Zeichen durch.** `plainText`/`multilineText`
  (`packages/shared/src/common.ts`) sperrten `\p{Cc}` und Bidi-Steuerzeichen, aber nicht U+FFFE,
  U+FFFF und einzelne Surrogate. XML 1.0 verbietet diese Zeichen; der XML-Builder bricht ab oder
  schreibt ein ungültiges Dokument. Stand: behoben durch I-01.
- **B9 Der bestehende Stundenzettel enthält Gesundheitsdaten.** `timesheetRows` in
  `apps/api/src/exports/exports.service.ts` schreibt die Abwesenheitsart (auch `sick`). Ein
  Stundennachweis für Kunden darf nicht auf diesem Export aufbauen. Stand: behoben durch I-04, der
  Stundennachweis ist ein eigener Export.
- **B10 Throttler vor der Sitzung, Pool und Transaktions-Timeout.** Der `ThrottlerGuard` läuft vor
  dem `SessionGuard` und zählt je IP (`apps/api/src/app.module.ts`, `apps/api/src/common/throttle.ts`), ein Limit je Nutzer
  braucht einen eigenen Guard auf Routenebene. Der Pool hat 10 Verbindungen (`apps/api/src/db/database.ts`,
  `POOL`), `idle_in_transaction_session_timeout` ist 30 s (`db/init/00-roles.sh`). Rendern
  innerhalb einer offenen Transaktion blockiert Verbindungen und wird bei langen Dokumenten
  abgebrochen. Stand: behoben durch D-02, `UserRateLimitGuard` für die Limits je Nutzer, Rendern im
  Worker außerhalb der Transaktion.
- **B11 Backup läuft als Tabelleneigentümer.** `zeit-live-backup` nutzte `zeit_owner`
  (`deploy/live/compose.yml`). Wer den Backup-Container übernimmt, kann Trigger abschalten und
  Rechnungen ändern. Stand: behoben durch R-05 (2), der Dump läuft als `zeit_backup`.
- **B12 Querverweis über 409.** Lädt ein Admin eine E-Mail-Adresse ein, die in einem anderen
  Mandanten existiert, antwortet die API mit 409 `ALREADY_EXISTS` (globale Eindeutigkeit in
  `app.users`). Das verrät, dass die Adresse irgendwo registriert ist. Stand: offen, siehe M-06.

## 4. Datenmodell, auf das sich die Maßnahmen beziehen

Entwurf und Umsetzung unterscheiden sich an mehreren Stellen. Die Maßnahmen unten beziehen sich auf
die Umsetzung; der Entwurf sah mehr getrennte Tabellen vor.

- `app.tenants.workspace` (Enum `app.workspace_kind`: `company` | `solo`) und
  `app.tenants.sandbox_group` (uuid, nur Sandbox), beide in `db/migrations/20260926000000_workspaces.sql`
- `app.billing_profiles` (1:1 je Mandant): Firma, Anschrift, Steuernummer, USt-IdNr., IBAN, BIC,
  Steuerprofil (Kleinunternehmer), Nummernpräfix, Zahlungsziel, Rundungsregel, Standardformat
- `app.clients`, `app.projects`, `app.tasks`, `app.project_members` (veränderliche Stammdaten mit
  `archived_at`, Kunden zusätzlich mit `restricted_at`); der Entwurf nannte die Kunden `customers`
- `app.rates`: Historie mit `valid_from`, kein UPDATE, DELETE nur vor Wirksamwerden, lesbar für HR und Administration
- `app.project_entries`: `employee_id`, `project_id`, `task_id`, `started_at`, `ended_at`, `source`
  (`timer` | `manual` | `seed`), `voided_at`, `invoice_id` (Abrechnungssperre)
- `app.invoices`: Entwurf und ausgestellte Rechnung in einer Tabelle, unterschieden durch `status`
  (`draft` | `issued` | `paid` | `cancelled`) und `kind` (`invoice` | `cancellation`, Verweis
  `refers_to_id`). Nummer (`number`, `number_year`, `number_seq`), `issue_date`, `due_date`,
  `service_from`, `service_to`, `seller` und `buyer` als `jsonb`-Schnappschuss, Summen in Cent
  (`net_cents`, `tax_cents`, `gross_cents`), `specimen`, `paid_on`, `retain_until` (generiert).
  Der Entwurf sah getrennte Tabellen `invoice_drafts` und `invoice_draft_lines` und die Spalten
  `series`, `snapshot`, `content_hash` und `chain_hash` vor; diese gibt es nicht (R-01, R-05)
- `app.invoice_counters`: `tenant_id`, `year`, `last_seq`, ein Kreis je Mandant und Jahr, keine Serien
  (`docs/adr/0003-cent-und-nummernkreis.md`)
- `app.invoice_lines`, `app.invoice_line_entries` (Zuordnung Buchung zu Position, bleibt nach dem
  Storno erhalten); der Entwurf nannte die zweite Tabelle `invoice_entries` mit `released_by_invoice_id`
- `app.invoice_documents`: `invoice_id`, `format` (`pdf` | `zugferd` | `xrechnung_cii` | `time_report_pdf` |
  `time_report_csv`), `content bytea`, `sha256`; der Entwurf nannte die Spalten `kind` und `body`
- Zahlungen: keine Tabelle `invoice_payments`, sondern die Spalten `status` und `paid_on` an
  `app.invoices` (R-10)
- Funktionen (SECURITY DEFINER, Eigentümer `zeit_system`, `search_path = ''`):
  `app.issue_invoice(p_invoice_id)`, `app.invoice_cancel(p_invoice_id, p_reason)`,
  `app.store_invoice_document(p_invoice_id, p_format, p_content)`, `app.hold_invoice_basis(p_invoice_id)`,
  `app.expected_tax_treatment(...)`, `ops.sandbox_create(...)`. Die im Entwurf genannten
  `app.invoice_series_start` und `app.invoice_chain_verify` gibt es nicht
- Fehlercodes: `ZT004` wird zu 409 `INVOICED`, `ZT005` zu 409 `SANDBOX_QUOTA`, `ZT006` zu 409
  `INVALID_STATE` (`apps/api/src/db/errors.ts`, `packages/shared/src/errors.ts`). Der Entwurf nannte
  `BILLED_LOCKED`

Migrationen: `db/migrations/20260926000000_workspaces.sql`, `db/migrations/20260926000100_projects.sql`,
`db/migrations/20260926000200_invoices.sql`, `db/migrations/20260925000200_purge_guard.sql`, dazu die
Härtungen `db/migrations/20260926000980_project_entry_hardening.sql` bis
`db/migrations/20260926001309_invoice_expected_treatment.sql`.

## 5. K3/K4: Unveränderbarkeit ausgestellter Rechnungen

### R-01 Ausgestellte Rechnung per UPDATE oder DELETE ändern (Tampering)

Angriff: A4 über einen künftigen PATCH-Endpunkt, A5, SQL-Injection als `zeit_app`.

- Maßnahme: Entwurf und ausgestellte Rechnung liegen in derselben Tabelle `app.invoices`, die
  Unveränderbarkeit trägt ein Trigger statt getrennter Tabellen. `app.guard_invoice()` (BEFORE UPDATE
  OR DELETE) lässt bei einer ausgestellten Rechnung nur `status`, `paid_on`, die Storno-Spalten,
  `updated_at` und `retain_until` durch, jede andere Änderung scheitert mit ZT002; DELETE gilt nur
  für `status = 'draft'`. Positionen und Buchungszuordnungen schützt `app.guard_invoice_child()`
  (ZT002, sobald die Rechnung kein Entwurf mehr ist). `app.invoice_documents` ist append-only über
  `app.reject_change()`. `zeit_app` hat auf Nummer, Daten, Summen und Schnappschüsse kein
  Spalten-Grant (42501). TRUNCATE sperren Trigger auf `invoices` und `invoice_documents`. RLS:
  Policy "hr manages invoices" für HR und Administration (Entscheidung vom 25.09.2026, nicht nur
  `admin`). Der Zahlungsstatus ist eine Spalte der Rechnung (R-10). `DELETE /invoices/:id` gibt es,
  der Trigger lässt es nur bei Entwürfen zu; ausgestellte Rechnungen haben keine ändernde Route
  außer Zahlung und Storno.
- Ort: `db/migrations/20260926000200_invoices.sql` (Trigger `invoices_guard`,
  `invoice_lines_guard`, `invoice_line_entries_guard`, `invoice_documents_append_only`,
  `invoices_no_truncate`, `invoice_documents_no_truncate`, Grants am Ende), Funktionen in `db/schema.sql`.
- Priorität: muss
- Status: teilweise umgesetzt. Offen ist ein TRUNCATE-Trigger auf `app.invoice_lines` und
  `app.invoice_line_entries`; dort schützt nur, dass `zeit_app` kein TRUNCATE-Recht hat. Der
  Superuser ist auf diesen beiden Tabellen nicht gesperrt (Lage wie R-05).
- Test: `apps/api/test/db/invoice-acceptance.int.spec.ts`: "refuses every column but status and
  payment to the superuser with ZT002" und "refuses every column to zeit_app with an admin context,
  by grant or by guard" (prüfen alle vier Tabellen Spalte für Spalte);
  `apps/api/test/db/journals.int.spec.ts`: "keeps %s append-only" für `app.invoice_documents`
  (zeit_app delete 42501, Superuser update, delete und truncate ZT002);
  `apps/api/test/db/invoices.int.spec.ts`: "freezes every business field once issued, for hr as well".

### R-02 Rechnung direkt einfügen, mit frei gewählter Nummer, Datum oder Summe (Tampering, Elevation)

Angriff: A4 oder SQL-Injection legt eine Rechnung mit Nummer `2026-0001` doppelt, rückdatiert
oder mit Summen an, die nicht zu den Positionen passen.

- Maßnahme: `zeit_app` darf auf `app.invoices` nur die Entwurfsspalten einfügen (Kunde, Zeitraum,
  Zahlungsziel, Sprache, Format, Steuerprofil, Texte), nicht Nummer, Status, Datum, Summen oder
  Schnappschüsse; auf `app.invoice_counters` hat es nur SELECT. Die Ausstellung läuft nur über
  `app.issue_invoice(p_invoice_id)`. Die Funktion prüft `app.role() >= 'hr'` (HR und
  Administration, Entscheidung vom 25.09.2026) und filtert den Entwurf selbst nach
  `app.tenant_id()` (BYPASSRLS, also jede Abfrage selbst filtern wie in `app.display_names`),
  vergibt die Nummer (N-01), setzt `issue_date = (now() at time zone 'Europe/Berlin')::date`,
  rechnet Positions- und Gesamtsummen in ganzen Cent aus den Positionen neu (ADR 0003, `bigint`
  statt `numeric`), kopiert Verkäufer und Käufer als `jsonb` in `seller` und `buyer` und setzt
  `issued_by = app.user_id()`. Der Client schickt nur die Rechnungs-ID und das Format. Der
  Leistungszeitraum der Rechnung wird nicht aus den Buchungen abgeleitet, sondern ist der
  Abrechnungszeitraum des Entwurfs (höchstens 366 Tage, Ende nicht vor dem Anfang).
- Ort: `db/migrations/20260926000200_invoices.sql` (Grants, Funktion), spätere Härtung in
  `db/migrations/20260926001100_invoice_issue_hardening.sql`; Aufruf in
  `apps/api/src/invoices/invoices.store.ts` und `apps/api/src/invoices/invoices.service.ts`.
- Priorität: muss
- Status: umgesetzt. Ein Test, der `app.issue_invoice` mit dem Entwurf eines anderen Mandanten
  aufruft, fehlt; die Funktion filtert nach `app.tenant_id()`, und fremde Rechnungs-IDs scheitern
  an der API mit 404 (N-04).
- Test: `apps/api/test/db/invoices.int.spec.ts`: "keeps the number, dates and snapshots out of reach
  of a column grant" (UPDATE auf Nummer, Datum, Summe, Schnappschuss und `issued_at` ergibt 42501);
  `apps/api/test/security/role-matrix.int.spec.ts`: "finds on every route the access the table
  expects" (`POST /invoices/:id/issue` mindestens `hr`); `apps/api/test/db/invoice-treatment.int.spec.ts`:
  "is held by hr and admins only" (Rolle unter HR ergibt 42501 in `app.hold_invoice_basis`).

### R-03 Sperre über `zeit.purge_tenant` umgehen (Tampering, Befund B1)

- Maßnahme: Die Löschausnahme in `app.reject_change()` und `app.guard_time_entry()` gilt nur, wenn
  `current_user` `zeit_system` oder `zeit_owner` ist (gegenüber dem Entwurf `<> 'zeit_app'` die
  strengere Positivliste). Direkte Löschungen der App laufen als `zeit_app`, die Kaskade aus dem
  Purge als `zeit_system`. Dieselbe Bedingung steht in `app.guard_invoice()` und
  `app.guard_project_entry()`. Ein DELETE-Recht von `zeit_app` auf Entwürfe berührt ausgestellte
  Rechnungen nicht, weil `app.guard_invoice()` DELETE bei `status <> 'draft'` mit ZT002 abweist
  (die getrennten Entwurfstabellen aus R-01 gibt es nicht).
- Ort: `db/migrations/20260925000200_purge_guard.sql` (`app.reject_change()`,
  `app.guard_time_entry()`), `db/migrations/20260926001102_invoice_payment_guard.sql`
  (`app.guard_invoice()`), `db/migrations/20260926000980_project_entry_hardening.sql`
  (`app.guard_project_entry()`); die aktuellen Fassungen stehen in `db/schema.sql`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/journals.int.spec.ts`: "keeps %s closed to zeit_app that sets
  zeit.purge_tenant" (inklusive `app.invoice_documents`, 42501) und "ignores zeit.purge_tenant from
  zeit_app even with a delete grant on %s" (ZT002 auch mit DELETE-Grant);
  `apps/api/test/db/invoice-acceptance.int.spec.ts`: "deletes nothing of it, not even with
  zeit.purge_tenant set by zeit_app"; `apps/api/test/demo/purge.int.spec.ts`: "leaves no row of them
  in any tenant table" (der Sandbox-Purge räumt weiter alles ab).

### R-04 Live-Mandant samt Rechnungen per Kaskade löschen (Tampering, Befund B2)

- Maßnahme: `BEFORE DELETE ON app.tenants` mit Abbruch (ZT002), wenn `old.kind <> 'sandbox'`
  (`app.guard_tenant_delete()`, strenger als der Entwurf mit `= 'live'`). Nur der Sandbox-Purge
  löscht Mandanten, er ist davon nicht betroffen. Dahinter sperrt `app.guard_tenant_retention()` das
  Löschen eines Live-Mandanten, solange eine ausgestellte Rechnung noch innerhalb von `retain_until`
  liegt, auch wenn der erste Trigger abgeschaltet ist. Die Fremdschlüssel von `app.invoices` auf
  `app.clients` und `app.users` haben keine `ON DELETE`-Aktion (Standard, kein CASCADE); die
  Kaskade von `app.invoices` auf `app.tenants` bleibt und ist durch die beiden Trigger gesperrt.
- Ort: `db/migrations/20260925000200_purge_guard.sql` (`guard_tenant_delete`),
  `db/migrations/20260926000200_invoices.sql` und `db/migrations/20260926001104_tenant_retention_definer.sql`
  (`guard_tenant_retention`).
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/access.int.spec.ts`: "deletes sandboxes only, a live tenant stays even for
  the superuser"; `apps/api/test/db/invoices.int.spec.ts`: "keeps a live tenant with an issued
  invoice, even for the superuser"; `apps/api/test/db/invoice-acceptance.int.spec.ts`: "holds a live
  tenant through the purge path even without the general delete guard, until retain_until";
  `apps/api/test/db/invoice-hardening.int.spec.ts`: "holds a live tenant even when the deleting role
  sees none of its invoices"; `apps/api/test/demo/purge.int.spec.ts`: "leaves no row of them in any
  tenant table".

### R-05 Trigger-Umgehung durch Eigentümer oder Superuser (Tampering, Repudiation)

Angriff: A6 mit `ALTER TABLE ... DISABLE TRIGGER`, `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY`,
`SET session_replication_role = replica`, `pg_restore --clean` eines manipulierten Dumps.

- Maßnahme: Verhindern lässt sich das nicht, nur erkennen und erschweren.
  1. `zeit_owner` bleibt nur im Migrations-Job, im CLI-Profil (läuft nicht mit `up`) und in der DB,
     nie im API-Container (`deploy/live/compose.yml`, `deploy/README.md`). Status: umgesetzt.
  2. Backup mit einer eigenen Rolle `zeit_backup` (nur lesend, BYPASSRLS, Mitglied von
     `pg_read_all_data`) statt `zeit_owner` (Befund B11). Status: umgesetzt, kein Test, die
     Rolle steht in `db/init/00-roles.sh` und der Dump-Aufruf in `deploy/live/compose.yml`.
  3. Kein `GRANT SET ON PARAMETER session_replication_role` an irgendeine App-Rolle. Status:
     umgesetzt durch Unterlassen, `db/` enthält keinen solchen Grant, ein Test dafür fehlt.
  4. Hash-Kette (`content_hash`, `chain_hash` und tägliche Prüfung durch `app.invoice_chain_verify()`
     im Job-Rahmen). Status: nicht umgesetzt. Weder Spalten noch Funktion noch Job existieren. Die
     Manipulation durch Owner oder Superuser (Trigger abschalten, Dump austauschen) bleibt damit
     unentdeckt; belegt ist nur, dass `invoice_documents.sha256` beim Einfügen aus dem Inhalt
     berechnet wird (R-07).
  5. Letzten Stand von Nummer und Kette täglich an ein Ziel außerhalb des Servers geben. Status:
     nicht umgesetzt. Die verschlüsselte Sicherung nach R2 (`deploy/README.md`) enthält die Daten,
     aber kein getrenntes Manifest mit der letzten Nummer je Mandant.
  6. Verfahrensdokumentation nennt, wer Owner-Zugang hat. Status: offen, im Repository gibt es
     keine Verfahrensdokumentation; `docs/rechnungen-recht.md` fordert sie, `deploy/README.md`
     beschreibt nur, welche Aufrufe als `zeit_owner` laufen.
- Ort: `db/init/00-roles.sh` (Rolle `zeit_backup`), `deploy/live/compose.yml` (Dienst
  `zeit-live-backup`), `deploy/README.md` (Abschnitt Restore).
- Priorität: 1–3 muss, 4–6 sollte
- Status: teilweise umgesetzt, Punkte 1 bis 3 stehen, 4 und 5 sind nicht umgesetzt, 6 ist offen.
- Test: keiner. Der Entwurf sah einen Test über `app.invoice_chain_verify()` vor; ohne die Funktion
  gibt es ihn nicht.

### R-06 Stammdaten ändern und damit alte Rechnungen umschreiben (Repudiation)

Angriff: A4 ändert Kundenanschrift, Steuernummer oder Satz; der Renderer zieht beim nächsten
Download die neuen Werte.

- Maßnahme: Renderer arbeiten bei einer ausgestellten Rechnung ausschließlich aus
  `app.invoices.seller`, `app.invoices.buyer` und `app.invoice_lines`, nie aus `clients`,
  `billing_profiles` oder `rates`; `app.issue_invoice` friert Verkäufer und Käufer ein, die Stornorechnung
  übernimmt sie aus dem Original. Gespeicherte Dokumente werden beim Download aus der Datenbank
  ausgeliefert, nicht neu erzeugt; nur ein fehlendes Dokument wird einmal aus dem Schnappschuss
  nachgerendert und gespeichert (D-02).
- Ort: `apps/api/src/documents/pdf.ts`, `apps/api/src/documents/documents.service.ts`,
  `apps/api/src/einvoice/from-invoice.ts`, `db/schema.sql` (`app.issue_invoice`, `app.invoice_cancel`).
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "takes seller and buyer from the original,
  without its texts" (nach Änderung von Kundenanschrift und Verkäuferort trägt die Stornorechnung
  die Daten des Originals); `apps/api/test/invoices/invoices.int.spec.ts`: "renders a watermarked
  preview for a draft and stores the real document once issued" (zweiter Abruf mit gleichem ETag);
  `apps/api/test/db/invoice-treatment.int.spec.ts`: "freezes the seller of a live invoice with
  exactly the keys of the api contract".

### R-07 Dokument austauschen oder vom Beleg abweichen lassen (Tampering)

- Maßnahme: `app.invoice_documents` nur INSERT (`invoice_documents_append_only`),
  `unique (tenant_id, invoice_id, format)`, Prüfsumme im Trigger `app.guard_invoice_document()`
  (`new.sha256 := sha256(new.content)`, ein mitgeschickter Wert wird überschrieben), Check
  `octet_length(content) <= 5242880`. Eingefügt wird nur über `app.store_invoice_document`, das
  Format und Anfangsbytes prüft und nur für ausgestellte Rechnungen speichert. PDF und XML
  entstehen aus demselben Rechnungsobjekt. `CreationDate` des PDF ist `issued_at`; ob pdfkit
  byte-gleich erzeugt, ist nicht belegt, deshalb gilt das gespeicherte Original.
- Ort: `db/migrations/20260926000200_invoices.sql`, `db/migrations/20260926001106_store_invoice_document.sql`,
  `apps/api/src/documents/pdf.ts`.
- Priorität: muss (insert-only, unique, Prüfsumme), sollte (Reproduzierbarkeit)
- Status: umgesetzt (insert-only, unique, Prüfsumme, Größengrenze); die Reproduzierbarkeit ist
  nicht geprüft, es gibt keinen Test, der ein zweites Rendern byte-gleich vergleicht.
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "come in through app.store_invoice_document
  only" (zweite Fassung wird nicht gespeichert, Entwürfe und Rollen unter HR scheitern) und "take
  only the formats of the invoice, each starting with its own bytes";
  `apps/api/test/invoices/einvoice.int.spec.ts`: "answers two downloads at once with the one original
  that got stored"; `apps/api/test/db/journals.int.spec.ts`: "keeps %s append-only".

### R-08 Storno missbrauchen (Tampering)

Angriff: doppelte Stornierung, Stornierung einer Stornorechnung, Storno mit abweichenden
Beträgen, Storno als verdecktes Löschen.

- Maßnahme: `app.invoice_cancel(p_invoice_id, p_reason)` erzeugt die Stornorechnung selbst: Positionen
  als exakte Negation des Originals, eigene Nummer aus demselben Kreis, `refers_to_id` auf das
  Original. Partieller Unique-Index `invoices_one_cancellation_idx` auf `(tenant_id, refers_to_id)
where kind = 'cancellation'`, Check `kind = 'invoice'` genau dann, wenn `refers_to_id` leer ist.
  Grund Pflicht (`reasonSchema`, die Funktion prüft mindestens 10 Zeichen). Das Original wird
  erst mit der ausgestellten Stornorechnung auf `cancelled` gesetzt, der Übergang ist in
  `app.guard_invoice()` an die Existenz dieser Stornorechnung gebunden. Step-up (Abschnitt 12).
- Ort: `db/migrations/20260926000200_invoices.sql` (`app.invoice_cancel`), Route
  `POST /invoices/:id/cancel` in `apps/api/src/invoices/invoices.controller.ts` mit
  `@Roles('hr')` (Controller) und `@RequireReauth()`; HR und Administration dürfen stornieren.
- Priorität: muss
- Status: umgesetzt. Die doppelte Stornierung endet in der Funktion mit ZT003, also 409
  `INVALID_STATE` (nicht `ALREADY_EXISTS`, das nur die Unique-Verletzung beim direkten INSERT
  liefert).
- Test: `apps/api/test/invoices/acceptance.int.spec.ts`: "takes one cancellation per invoice, none of
  a cancellation, numbered from the same counter"; `apps/api/test/db/invoice-acceptance.int.spec.ts`:
  "keeps a second cancellation row out, even for the superuser" und "reaches cancelled only through an
  issued cancellation, and never leaves it"; `apps/api/test/invoices/totals.int.spec.ts`: "mirrors
  every sum in the cancellation, half cents rounded away from zero".

### R-09 Abgerechnete Zeiten ändern oder doppelt abrechnen (Tampering)

- Maßnahme: Die Sperre hängt als Spalte `invoice_id` an `app.project_entries`; eine Buchung zeigt
  damit auf höchstens eine Rechnung (statt des geplanten Unique-Index auf `app.invoice_entries`).
  `app.guard_project_entry()` bricht jede Änderung einer abgerechneten Buchung, auch Void, mit `ZT004`
  (409 `INVOICED`) ab. `app.guard_project_entry_invoice()` erlaubt das Setzen von `invoice_id` nur auf
  einen offenen Entwurf desselben Kunden und das Lösen nicht von einer ausgestellten oder bezahlten
  Rechnung. `app.invoice_cancel` löst die Buchungen beim Storno wieder. `app.invoice_line_entries`
  hält die Zuordnung Buchung zu Position und bleibt nach dem Storno erhalten. Ein Check
  (`project_entries_check2`) lässt `invoice_id` nur bei beendeten, nicht stornierten Buchungen zu,
  ein laufender Timer ist also nie abgerechnet. Im Betrieb gibt es keinen eigenen Abbruch, wenn
  eine Korrektur eine `app.time_entries`-Zeile storniert, deren Projektzuordnung abgerechnet ist:
  Projektbuchungen sind von `time_entries` getrennt (ADR 0002).
- Ort: `db/migrations/20260926000100_projects.sql`,
  `db/migrations/20260926000980_project_entry_hardening.sql`,
  `db/migrations/20260926001103_project_entry_invoice_guard.sql`, `apps/api/src/db/errors.ts`,
  `packages/shared/src/errors.ts`.
- Priorität: muss
- Status: umgesetzt, mit der beschriebenen Abweichung von der Tabelle `invoice_entries`.
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "keeps an entry on an issued or paid invoice,
  for hr and the superuser alike", "lets an entry go from a draft and from a cancelled invoice" und
  "puts an entry only onto an open draft of its own client";
  `apps/api/test/invoices/acceptance.int.spec.ts`: "answers 409 INVOICED on time of an issued invoice
  and frees it with the cancellation"; `apps/api/test/db/projects.int.spec.ts`: "freezes an invoiced
  entry and leaves the invoice to hr".

### R-10 Zahlungsstatus verschleiern (Repudiation)

- Maßnahme: Umgesetzt ist eine einfachere Form. `app.invoices` trägt `status` (`issued` | `paid`) und
  `paid_on`; `app.guard_invoice()` erlaubt nur die Übergänge `issued` zu `paid` und zurück, ein
  Zahlungsdatum nur zusammen mit dem Statuswechsel und nicht in der Zukunft (Berliner Datum), und
  eine Stornorechnung wird nie bezahlt (Check `invoices_cancellation_unpaid`). Jeder Wechsel steht im
  Protokoll (`audit.track()` auf `app.invoices`, dazu `invoice.paid` und `invoice.unpaid` als
  App-Ereignis mit IP). "Überfällig" wird aus `due_date` und Serverdatum berechnet, nicht
  gespeichert. HR und Administration, höchstens 30 Wechsel je Minute und Person. Die geplante
  Tabelle `app.invoice_payments` mit Teilzahlungen und Rückbuchungszeilen gibt es nicht.
- Ort: `db/migrations/20260926001102_invoice_payment_guard.sql` (`app.guard_invoice()`),
  Routen `POST /invoices/:id/paid` und `POST /invoices/:id/unpaid` in `apps/api/src/invoices/invoices.controller.ts`.
- Priorität: sollte
- Status: teilweise umgesetzt. Nicht umgesetzt sind Teilzahlungen und die append-only Zahlungsliste;
  das Zurücksetzen auf unbezahlt ist möglich und nur über das Protokoll nachvollziehbar.
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "takes no payment date from the future and
  moves it only with the status" und "never marks a cancellation as paid";
  `apps/api/test/db/invoice-acceptance.int.spec.ts`: "moves between issued and paid in both directions";
  `apps/api/test/invoices/invoices.int.spec.ts`: "goes from draft to issued to paid and back, in the
  same protocol"; `apps/api/test/invoices/rate-limits.int.spec.ts`: "counts paid and unpaid together,
  30 a minute".

## 6. K3/K4: Nummernkreis

### N-01 Doppelvergabe unter Nebenläufigkeit (Tampering)

- Maßnahme: In `app.issue_invoice` (die Stornorechnung geht über dieselbe Funktion):
  `insert into app.invoice_counters as c (tenant_id, year, last_seq) values (app.tenant_id(), year_num, 1)
on conflict (tenant_id, year) do update set last_seq = c.last_seq + 1 returning c.last_seq`.
  Der Upsert sperrt die Zeile bis zum Commit, auch beim allerersten Beleg eines Jahres. Dazu
  `unique (tenant_id, number)` und `unique (tenant_id, number_year, number_seq)`. Keine Sequenz:
  `nextval` ist nicht transaktional und reißt bei jedem Rollback Lücken. Es gibt einen Kreis je
  Mandant und Jahr, keine Serien (ADR 0003).
- Ort: `db/migrations/20260926000200_invoices.sql`, `db/migrations/20260926001100_invoice_issue_hardening.sql`
  (`app.issue_invoice`, `app.invoice_counters`).
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/invoices.int.spec.ts`: "hands out 1 through 20 exactly once";
  `apps/api/test/invoices/acceptance.int.spec.ts`: "hands out 2 to 21 once each to twenty parallel
  issues, after a first one already went out"; `apps/api/test/db/invoice-hardening.int.spec.ts`: "lets
  one through and spends exactly one number" (derselbe Entwurf aus zwei Verbindungen).

### N-02 Lücken erzwingen oder den Zähler verstellen (Tampering)

- Maßnahme: Zähler und Rechnung in derselben Transaktion; scheitert irgendetwas nach der Vergabe,
  rollt der Zähler mit zurück. `zeit_app` darf `app.invoice_counters` nur lesen (INSERT und
  UPDATE von `last_seq` hat nur `zeit_system`), jeder Schritt des Zählers steht im Protokoll
  (`audit_invoice_counters`, lesbar für Administration und den Ausstellenden). Präfix per zod
  `^[A-Z0-9-]{0,10}$` (`invoicePrefixSchema` in `packages/shared/src/billing.ts`) und als Check an
  `billing_profiles.invoice_prefix`, weil er in Dateinamen, PDF und XML landet. Ein Startwert für
  einen Umzug aus einem anderen Programm (`app.invoice_series_start`, Route
  `PUT /invoice-series/:series/start`) ist nicht umgesetzt; der Zähler beginnt je Jahr bei 1.
- Ort: `db/migrations/20260926000200_invoices.sql`, `db/migrations/20260926001105_invoice_counter_audit.sql`,
  `packages/shared/src/billing.ts`.
- Priorität: muss
- Status: umgesetzt, bis auf den Startwert (nicht umgesetzt, nicht Teil von Version 1).
- Test: `apps/api/test/db/invoices.int.spec.ts`: "gives a number back after a rollback, the next
  issue gets the same one"; `apps/api/test/invoices/acceptance.int.spec.ts`: "hands the number back
  when the service fails after numbering" und "hands the cancellation number back when the
  cancellation fails after numbering"; `apps/api/test/db/invoice-hardening.int.spec.ts`: "logs every
  step of the counter, for admins and the issuer only" (inklusive UPDATE auf den Zähler als `zeit_app`
  ergibt 42501).

### N-03 Rückdatieren in ein anderes Jahr oder eine andere Periode (Tampering)

- Maßnahme: Ausstellungsdatum und Nummernjahr kommen aus `now()` der Datenbank in Europe/Berlin.
  Die Entwurfs- und Ausstellungs-Schemas (`createDraftSchema`, `updateDraftSchema`,
  `issueInvoiceSchema`) sind `z.strictObject` ohne Datumsfeld für die Ausstellung. Der
  Leistungszeitraum ist ein eigenes Feld des Entwurfs (`from`, `to`), kein Ausstellungsdatum.
- Ort: `app.issue_invoice` in `db/schema.sql`, `packages/shared/src/billing.ts`.
- Priorität: muss
- Status: umgesetzt; ein Test, der ein Feld `issueDate` im Request mit 400 abweist, fehlt, das
  Verhalten folgt aus `z.strictObject`.
- Test: `apps/api/test/db/invoices.int.spec.ts`: "keeps the number, dates and snapshots out of reach
  of a column grant" (`issue_date` ist für `zeit_app` nicht beschreibbar);
  `apps/api/test/invoices/acceptance.int.spec.ts`: "takes no date after today in Berlin" (Zahlungsdatum).

### N-04 Nummern raten und aufzählen (Information Disclosure)

- Maßnahme: Routen adressieren Rechnungen nur über die UUID, nie über die Nummer. Keine
  öffentlichen oder tokenbasierten Download-Links. Fremde und nicht vorhandene IDs antworten
  gleich mit 404. Suche nach Nummer nur innerhalb des Mandanten (RLS).
- Ort: `apps/api/src/invoices/invoices.controller.ts`, Zeilen in
  `apps/api/test/security/role-matrix.int.spec.ts`.
- Priorität: muss
- Status: umgesetzt. Der Test belegt den Status 404, nicht die Gleichheit des Bodys mit dem einer
  zufälligen UUID.
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "reaches nothing of this invoice through an
  id" (GET, PATCH und Dokument einer Rechnung aus einem anderen Mandanten ergeben 404);
  `apps/api/test/invoices/einvoice.int.spec.ts`: "keeps another tenant out and turns a team lead
  away".

### N-05 Doppelvergabe nach einem Restore (Tampering)

Angriff: kein Angreifer nötig. Ein Restore auf den Stand von gestern setzt den Zähler zurück, die
seitdem verschickten Nummern werden neu vergeben.

- Maßnahme: Runbook-Schritt nach jedem Restore: letzte Nummer je Mandant mit einem externen Stand
  abgleichen und den Zähler darüber setzen, vorher keine Ausstellung. Der Entwurf stützte sich auf
  den externen Stand aus R-05 (5) und `app.invoice_series_start`; beides gibt es nicht.
- Ort: `deploy/README.md` (Abschnitt Restore), `docs/adr/0003-cent-und-nummernkreis.md` (Folgen).
- Priorität: sollte
- Status: offen. ADR 0003 nennt den Abgleich als Pflicht, in der Restore-Anleitung von
  `deploy/README.md` steht der Schritt nicht, und es gibt keinen Weg außer einem Eingriff als
  `zeit_owner`, den Zähler zu setzen.
- Test: keiner; der monatliche Restore-Test in `deploy/README.md` prüft den Zählerstand nicht.

## 7. K2/K3: Zugriff und IDOR

### Z-01 Fremde Kunden, Projekte, Rechnungen, Dokumente per ID (Information Disclosure, Tampering)

- Maßnahme: Jede neue Tabelle mit `tenant_id not null`, `unique (tenant_id, id)`, zusammengesetzten
  Fremdschlüsseln `(tenant_id, x_id)`, RESTRICTIVE-Zaun und FORCE. Die neuen Tabellen in die Liste
  `tables` des Meta-Tests aufnehmen (der Test "knows every table that belongs to a tenant" scheitert
  von selbst, bis das passiert). Jede Definer-Funktion filtert selbst nach `app.tenant_id()`.
- Ort: `db/migrations/20260926000100_projects.sql`, `db/migrations/20260926000200_invoices.sql`,
  `apps/api/test/db/rls.int.spec.ts`.
- Priorität: muss
- Status: umgesetzt. Alle Fremdschlüssel der Projekt- und Rechnungstabellen sind zusammengesetzt über
  `(tenant_id, x_id)`; ohne Mandantenspalte sind nur die Fremdschlüssel der `auth`-Tabellen auf `app.users`.
- Test: `apps/api/test/db/rls.int.spec.ts`: "knows every table that belongs to a tenant" (scheitert,
  bis eine neue Tabelle in der Liste steht), "fences every table by tenant, forced and restrictive",
  "gives every tenant-owned table a mandatory tenant_id" und `it.each(tables)`: "shows tenant a no row
  of tenant b in %s" (unter anderem `app.invoices`, `app.invoice_documents`, `app.clients`,
  `app.project_entries`); dazu `apps/api/test/invoices/invoices.int.spec.ts`: "reaches nothing of
  this invoice through an id" (Dokument einer Rechnung aus Mandant B ergibt 404).

### Z-02 Beschäftigte und Teamleitung sehen Sätze, Umsätze, Rechnungen (Information Disclosure)

- Maßnahme: `@Roles('hr')` (HR und Administration, Entscheidung vom 25.09.2026) auf Kunden,
  Projekte, Sätze, Entwürfe, Rechnungen, Zahlungsstatus; die Rechnungsstammdaten ändert nur
  `admin` (`PATCH /billing/profile`), einen Kunden löscht nur `admin` mit Step-up. Sätze in eigener
  Tabelle `app.rates` mit Policy "hr reads rates", damit die Projektliste für Beschäftigte keine
  Satzspalte enthalten kann; Beschäftigte und Teamleitung sehen Projekte nur über `app.bookable_projects()`
  und in Minuten ohne Betrag. Jede Route bekommt eine Zeile in der Rollen-Matrix, sonst scheitert
  der Test.
- Ort: Controller in `apps/api/src/projects/`, `apps/api/src/invoices/`, `apps/api/src/billing/`,
  `apps/api/test/security/role-matrix.int.spec.ts`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/projects.int.spec.ts`: "shows employees and leads no rates and no client
  master data"; `apps/api/test/security/role-matrix.int.spec.ts`: "keeps the project list from an
  employee", "carries minutes and never an amount, not even for hr" und "has a line for every
  registered route"; `apps/api/test/projects/project-engine.spec.ts`: "gives leads and employees no
  amount anywhere, whatever the entries look like".

### Z-03 Ungeeignete Buchungen in einen Entwurf übernehmen (Tampering, Elevation)

Angriff: Entwurf mit IDs von Buchungen anderer Kunden, laufender Timer, stornierter Buchungen oder
schon abgerechneter Zeiten.

- Maßnahme: Entwurf entsteht aus Kunde, optional Projekten und Zeitraum (`createDraftSchema`); die
  Buchungen wählt der Server, der Client schickt keine Buchungs-IDs. In der Datenbank prüft
  `app.guard_project_entry_invoice()` beim Setzen von `invoice_id`: offener Entwurf, Projekt gehört
  zum Kunden des Entwurfs (`check_violation` sonst). Dazu der Check `project_entries_check2`:
  nur beendete, nicht stornierte Buchungen. Die geplante "Bestätigung" einer Buchung gibt es nicht;
  Timer-Buchungen ab 12 Stunden löst die Sperre beim Ausstellen aus (T-02).
- Ort: `apps/api/src/invoices/invoices.service.ts`, `db/migrations/20260926001103_project_entry_invoice_guard.sql`.
- Priorität: muss
- Status: umgesetzt, mit der Abweichung bei der Bestätigung (siehe T-02).
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "puts an entry only onto an open draft of
  its own client"; `apps/api/test/db/invoice-acceptance.int.spec.ts`: "lets no position or booking
  move over to a draft of the same client"; `apps/api/test/invoices/invoices.int.spec.ts`: "books the
  unbilled time of a period into a priced line".

### Z-04 Projektbuchungen anderer Beschäftigter lesen oder ändern (Information Disclosure, Tampering)

- Maßnahme: Policies auf `app.project_entries` nach dem Muster von `app.time_entries`: "read own",
  "leads read their team's", "hr manages", INSERT nur mit `employee_id = app.employee_id()`.
  Im Service `assertCanSee` (`apps/api/src/common/scope.ts`).
- Ort: `db/migrations/20260926000100_projects.sql`, `apps/api/src/projects/project-entries.service.ts`
  und `apps/api/src/projects/project-week.service.ts` (`assertCanSee`).
- Priorität: muss
- Status: umgesetzt. Die Route heißt `GET /employees/:id/project-entries`.
- Test: `apps/api/test/db/projects.int.spec.ts`: "shows a person their own entries, the lead and hr
  the others too"; `apps/api/test/projects/project-entries.int.spec.ts`: "shows an employee nobody
  else", "lets a lead read the team but change nothing of it" und "does not let a lead or an employee
  book for someone else"; `apps/api/test/projects/project-week.int.spec.ts`: "keeps the week of a
  colleague closed".

### Z-05 Mass Assignment in Entwürfen (Tampering)

- Maßnahme: zod-Schemas als `z.strictObject` in `packages/shared/src/billing.ts`. Positionen
  nur mit Beschreibung, Menge, Einheit, Einzelpreis, Steuerkategorie (mit Befreiungsgrund bei
  `exempt`); der Steuersatz folgt serverseitig aus Kategorie und Leistungsdatum. Für Nummer, Status
  und Summen gibt es kein Spalten-Grant (R-02), ein Entwurf ist `status = 'draft'` ohne Nummer.
- Ort: `packages/shared/src/billing.ts` (`createDraftSchema`, `updateDraftSchema`,
  `invoiceLineInputSchema`), `db/migrations/20260926000200_invoices.sql`.
- Priorität: muss
- Status: umgesetzt; ein Test, der eine Anfrage mit `number` oder `totalNet` im Body abweist, fehlt.
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "refuses a free position whose tax category
  does not match the invoice treatment" und "wants a reason on a tax exempt position and on no
  other"; `apps/api/test/db/invoices.int.spec.ts`: "keeps the number, dates and snapshots out of
  reach of a column grant".

### Z-06 Dokumente im Cache oder im Browser-Kontext (Information Disclosure)

- Maßnahme: Downloads mit `Cache-Control: no-store`, exaktem `Content-Type` (`application/pdf`,
  `application/xml; charset=utf-8`) und `nosniff` (helmet setzt es schon). Das XML kommt als
  `attachment`. Das PDF kommt `inline`, weil die Oberfläche es in einem `iframe` zeigt; dafür trägt es
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'self'` und
  `X-Frame-Options: SAMEORIGIN`. Dateiname aus der Nummer, bereinigt mit `replace(/[^\w-]/g, '_')`.
- Ort: `apps/api/src/invoices/invoices.controller.ts` (`document`, `xml`, `previewPdf`),
  `apps/api/src/invoices/invoices.service.ts` (Dateiname), analog `attach()` in
  `apps/api/src/exports/exports.controller.ts`.
- Priorität: muss
- Status: umgesetzt, mit der Abweichung `inline` beim PDF. `no-store` setzt der Controller, die
  Tests prüfen Content-Type, Disposition, CSP, ETag und Dateiname, nicht den Cache-Header.
- Test: `apps/api/test/invoices/einvoice.int.spec.ts`: "stores only the pdf of a plain pdf invoice and
  has no xml for it" (PDF: Content-Type, `inline`, CSP, `X-Frame-Options`, ETag) und "keeps the
  xrechnung xml byte for byte and serves a readable pdf next to it" (XML: Content-Type,
  `attachment`, ETag).

### Z-07 Teure GET-Aufrufe von einer anderen Subdomain (Denial of Service)

Angriff: Eine Seite auf irgendeiner `*.dmn-software.com`-Subdomain bindet
`<img src="https://zeit.dmn-software.com/api/exports/time-report?format=pdf">` ein. Die
Anfrage ist same-site, das `SameSite=Strict`-Cookie geht mit, der `CsrfGuard` prüft GET nicht.
Lesen kann der Angreifer die Antwort nicht, aber er lässt im Namen des Opfers rendern.

- Maßnahme: Alles, was rendert (Entwurfsvorschau, Stundennachweis-PDF), als POST hinter dem
  `CsrfGuard`. Gespeicherte Dokumente dürfen GET bleiben.
- Ort: Controller `apps/api/src/invoices/invoices.controller.ts` und
  `apps/api/src/exports/exports.controller.ts`.
- Priorität: sollte
- Status: nicht umgesetzt, bewusst ersetzt (Begründung im Nachtrag vom 01.10.2026). Stattdessen
  gelten das Limit je Nutzer und die Render-Warteschlange. Der `CsrfGuard` selbst ist für
  schreibende Anfragen geprüft.
- Test: für den Ersatz `apps/api/test/invoices/rate-limits.int.spec.ts`: "stops $route after 20 calls
  a minute of one person" (Zeitnachweis der Rechnung und Export) und
  `apps/api/test/invoices/render.int.spec.ts`: "answers 503 with Retry-After on the real route once
  the render pool and its queue are both full"; für den Guard `apps/api/test/auth/csrf.int.spec.ts`:
  "lets a same-origin json write with the token through" und "refuses a write that is not json, as a
  plain form would send it".

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

- Maßnahme: Die Spalte `app.tenants.workspace` (Enum `app.workspace_kind` mit `company`/`solo`; der
  Entwurf nannte sie `mode` mit `team`/`solo`) steht nicht in der Spaltenliste des UPDATE-Grants an
  `zeit_app` (dort `name, state, holiday_options, ...`, siehe
  `db/migrations/20260924000500_auth_hardening.sql`) und nicht im `updateTenantSchema`. Gesetzt wird
  der Typ nur von der CLI bei der Anlage (`ops.tenant_create`). In die bestehenden Guards
  (`app.guard_request_status()`, `app.guard_own_user()`) kommt keine Solo-Ausnahme; der Solo-Bereich
  nutzt Korrekturen und Genehmigungen einfach nicht. Welche Routen im Solo-Mandanten erreichbar
  sind, entscheidet der `WorkspaceGuard` nach `workspace` aus `auth.session_resolve` (bei jedem
  Request aus der DB, nie aus Client-Angaben); Routen der Firma antworten dort 404 `NOT_FOUND` wie
  eine unbekannte Route. Eine RESTRICTIVE-Policy `company workspace` sperrt die Tabellen der Firma auch in
  der Datenbank. `PATCH /tenant` mit `workspace` im Body ergibt 200 ohne Wirkung, weil
  `updateTenantSchema` unbekannte Felder verwirft; ein direktes UPDATE
  der Spalte als `zeit_app` scheitert davon unabhängig mit 42501.
- Ort: `db/migrations/20260926000000_workspaces.sql`, `packages/shared/src/tenant.ts`,
  `apps/api/src/cli/tenant-create.ts`, `apps/api/src/common/workspace.guard.ts`,
  `auth.session_resolve` in `db/schema.sql`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/access.int.spec.ts`: "never lets zeit_app switch the workspace of a tenant"
  (42501); `apps/api/test/tenant/tenant.int.spec.ts`: "ignores kind, workspace, slug and expiry";
  `apps/api/test/security/role-matrix.int.spec.ts`: "finds on every route the workspace the table
  expects"; `apps/api/test/db/rls.int.spec.ts`: "closes the hr tables and only those to a solo
  workspace".

### M-02 Solo-Mandant mit mehreren Personen (Elevation of Privilege)

- Maßnahme: `BEFORE INSERT OR UPDATE` auf `app.users` und `app.employees` (`app.guard_solo_members()`):
  im Solo-Mandanten höchstens eine Person, Rolle `admin`. Gegen zwei gleichzeitige Einladungen
  `pg_advisory_xact_lock(hashtextextended('solo_members ' || new.tenant_id::text, 0))` für beide
  Tabellen. Ein zweiter Insert scheitert mit ZT003 (API: 409 `INVALID_STATE`, nicht 42501 wie im
  Entwurf). `POST /users` und `POST /users/:id/invite` antworten im Solo-Bereich über den
  `WorkspaceGuard` mit 404 `NOT_FOUND` wie eine unbekannte Route, nicht mit 409.
- Ort: `db/migrations/20260926000000_workspaces.sql` (`app.guard_solo_members`),
  `apps/api/src/common/workspace.guard.ts`, `apps/api/src/users/users.controller.ts`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/workspace.int.spec.ts`: "takes neither a second user nor a second employee"
  und "lets only one of two parallel invitations in";
  `apps/api/test/security/role-matrix.int.spec.ts`: "hides $route from a solo workspace like an
  unknown route" (unter anderem `POST /users` und `POST /users/:id/invite`).

### M-03 Mandanten über die API anlegen (Spoofing, Elevation, Befund B3)

- Maßnahme: INSERT auf `app.tenants` für `zeit_app` entzogen, die Policy "admins create the tenant"
  gestrichen. Die CLI verbindet sich über `CLI_DATABASE_URL` als `zeit_owner` (Migrations-Zugang),
  nicht als `zeit_app`, und ruft `ops.tenant_create(...)` auf, das `zeit_app` nicht ausführen darf.
  Sandboxes legt `ops.sandbox_create(...)` an, eine Definer-Funktion, die `kind = 'sandbox'` und
  `expires_at = now() + interval '24 hours'` selbst setzt und nur mit `app.demo_mode` läuft. Auch
  das Zurücksetzen des zweiten Faktors und das Archivieren eines Mandanten laufen nur über die
  CLI (`user:mfa-reset`, `tenant:archive`, `ops.mfa_reset_operator`, `ops.tenant_archive`,
  ausführbar nur für `zeit_owner`, Protokolleintrag mit Quelle `cli`). Eine eigene Rolle `zeit_cli`
  gibt es nicht.
- Ort: `db/migrations/20260925000200_purge_guard.sql`, `apps/api/src/cli.ts`,
  `apps/api/src/cli/tenant-create.ts`, `apps/api/src/cli/mfa-reset.ts`, `apps/api/src/cli/tenant-archive.ts`.
- Priorität: sollte
- Status: umgesetzt
- Test: `apps/api/test/db/access.int.spec.ts`: "never lets zeit_app create a tenant of its own"
  (INSERT und `ops.tenant_create` ergeben 42501) und "opens a sandbox for 24 hours, the rest of it
  goes in as zeit_app"; `apps/api/test/demo/sandboxes.int.spec.ts`: "takes neither kind nor expiry
  from the caller" und "cannot turn a live tenant into a sandbox by its id";
  `apps/api/test/cli/cli.int.spec.ts`: "opens a solo workspace with one person who is its admin".

### M-04 Übergriff zwischen Betrieb und Solo über Mandantenwechsel (Information Disclosure)

- Maßnahme: Kein Endpunkt übernimmt eine Mandanten-ID aus dem Request, Stores lesen sie nur aus
  `AuthSession`. Eine Person, ein Mandant. Wird später Mehrfachmitgliedschaft gebraucht: neue
  Sitzung je Mandant über eine Definer-Funktion, die die Mitgliedschaft prüft (Muster
  `ops.demo_switch_persona`), nie ein Umschalten innerhalb der Sitzung.
- Ort: alle Services in `apps/api/src/projects/`, `apps/api/src/invoices/`, `apps/api/src/billing/`;
  Regel in `docs/architecture.md`, "Data access".
- Priorität: muss
- Status: umgesetzt. Ein Body mit `tenantId` wird je nach Schema verworfen (`updateTenantSchema`)
  oder von einem `strictObject`-Schema mit 400 abgewiesen (Rechnungs- und Projektrouten); der
  Mandant kommt in jedem Fall aus der Sitzung. Ein Test mit `tenantId` im Body fehlt.
- Test: `apps/api/test/db/rls.int.spec.ts`: "shows tenant a no row of tenant b in %s";
  `apps/api/test/demo/personas.int.spec.ts`: "answers 404 for the freelancer of another visitor,
  from either side"; `apps/api/test/projects/projects.int.spec.ts`: "reaches nothing of this one
  through an id".

### M-05 Freelancer-Persona: Wechsel in fremde Sandboxes (Elevation of Privilege)

Gilt, wenn die Freelancer-Persona in einem eigenen Solo-Sandbox-Mandanten lebt (Abschnitt 14,
Punkt 3). `ops.demo_switch_persona` erlaubte zunächst nur Ziele im selben Mandanten.

- Maßnahme: `app.tenants.sandbox_group` (uuid) wird bei der Anlage beider Sandboxes gesetzt
  (`ops.sandbox_seed`), kein UPDATE-Grant. Der Wechsel erlaubt Ziele mit gleicher Gruppe,
  `kind = 'sandbox'`, nicht abgelaufen. Der Purge räumt die Gruppe gemeinsam ab.
- Ort: `db/migrations/20260926000000_workspaces.sql`, `db/migrations/20260926000120_sandbox_projects.sql`,
  `ops.demo_switch_persona` und `ops.purge_sandbox` in `db/schema.sql`.
- Priorität: muss (falls eigener Mandant)
- Status: umgesetzt
- Test: `apps/api/test/demo/personas.int.spec.ts`: "answers 404 for the freelancer of another
  visitor, from either side" und "crosses into the solo workspace of the same visitor and back";
  `apps/api/test/db/sessions.int.spec.ts`: "does not cross into another tenant";
  `apps/api/test/db/sandbox.int.spec.ts`: "opens it next to the company, in the same group and with
  the same expiry" und "gives each seed a group of its own"; `apps/api/test/db/access.int.spec.ts`:
  "never lets zeit_app switch the workspace of a tenant" (inklusive `sandbox_group`, 42501).

### M-06 Querverweis über 409 bei der Einladung (Information Disclosure, Befund B12)

- Maßnahme: Einladung antwortet immer gleich; existiert die Adresse schon woanders, geht an sie eine
  neutrale Mail statt eines Fehlers an den Einladenden.
- Ort: `apps/api/src/users/users.service.ts`.
- Priorität: sollte
- Status: offen. Die Einladung einer Adresse, die schon vergeben ist, antwortet weiter mit 409
  `ALREADY_EXISTS`, und der Test hält genau das fest.
- Test: heute prüft `apps/api/test/users/users.int.spec.ts`: "refuses an address that is taken"
  das Gegenteil (409 `ALREADY_EXISTS`); der Test zur neutralen Antwort entsteht mit der Maßnahme.

Nachtrag 25.09.2026: Die Namen und Antwortcodes der Umsetzung (`workspace` statt `mode`,
`guard_solo_members`, 404 statt 409 im Solo-Bereich, ZT003 statt 42501) stehen oben in M-01, M-02
und M-05. Gegenüber dem Entwurf gilt fachlich alles unverändert.

## 9. K5/K6: Injection in PDF, XML und CSV

### I-01 XML-Injection über Freitexte (Tampering)

Angriff: Kundenname, Positionstext oder Leitweg-ID mit `</cbc:Name><cbc:ID>...`, `]]>` oder
verbotenen Zeichen.

- Maßnahme: XML entsteht nur über `@e-invoice-eu/core` aus einem JSON-Objekt, nie über
  Template-Strings. Alle Rechnungs-Freitexte laufen durch `invoicePlainText`/`invoiceMultilineText`
  (aufgebaut auf `plainText`/`multilineText`) mit Längen nach XRechnung. Das Textschema sperrt
  zusätzlich U+FFFE, U+FFFF und einzelne Surrogate (`HIDDEN` und `LONE_SURROGATE` in
  `packages/shared/src/common.ts`), Befund B8; `einvoiceBlockers` prüft dieselben Zeichen noch
  einmal vor dem Rendern (Blocker `text_not_xml`). Leitweg-ID (Prüfziffer), USt-IdNr. und IBAN
  (Prüfziffer mod 97) und BIC haben eine Formatprüfung. Die erzeugten XRechnungen der Golden-Fälle
  prüft der KoSIT-Validator in CI (`apps/api/test/einvoice/kosit.sh`, Job `einvoice`).
- Ort: `packages/shared/src/common.ts` (Funktion `text`), `packages/shared/src/billing.ts`,
  `apps/api/src/einvoice/blockers.ts`, `apps/api/src/einvoice/einvoice.ts`,
  `.github/workflows/ci.yml`.
- Priorität: muss
- Status: umgesetzt. Die Sperre im Textschema selbst hat keinen eigenen Test in `packages/shared/src/text.spec.ts`; die
  Zeichen sind über den Blocker belegt.
- Test: `apps/api/test/einvoice/einvoice.spec.ts`: "refuses %s" (U+FFFE, U+FFFF, einzelne Surrogate,
  Backspace ergeben `text_not_xml`), "writes markup in a name as text" (Kundenname mit
  `</ram:Name><ram:ID>X</ram:ID> ]]>` steht als escapter Text im XML) und "refuses to render a
  blocked invoice"; `apps/api/test/einvoice/golden.spec.ts`: "matches the XRechnung golden file";
  `packages/shared/src/text.spec.ts`: "refuses a character the invoice font is not guaranteed to
  show"; `packages/shared/src/errors.spec.ts`: "%s comes out of the schema" (`format.iban`,
  `format.vatId`).

### I-02 XXE und Entity-Expansion beim Parsen (Information Disclosure, Denial of Service)

Im geplanten Ablauf parst die API kein XML. Das ändert sich, sobald jemand das erzeugte XML zur
Selbstprüfung parst oder E-Rechnungen empfangen werden.

- Maßnahme: Vor jedem Parsen `<!DOCTYPE` ablehnen. Parser ohne Entitäten und ohne Netz
  (libxmljs: `noent: false, nonet: true, dtdload: false`; fast-xml-parser: `processEntities: false`),
  Größenlimit, Parsen im Worker (D-02). Empfang fremder XML- oder ZUGFeRD-Dateien ist ein Upload
  und erst nach Entscheidung (Abschnitt 14, Punkt 1) zu bauen.
- Ort: wo immer ein Parser dazukommt; Abnahme durch eine zweite Sicherheitsprüfung.
- Priorität: muss, sobald geparst wird
- Status: gegenstandslos, bis ein Parser dazukommt. Die API parst kein XML und kein PDF aus
  Nutzerdaten: `@e-invoice-eu/core` erzeugt das XML aus einem JSON-Objekt, `pdf-parse` liegt nur
  unter den `devDependencies` und läuft in Tests. Der Empfang fremder E-Rechnungen ist nicht
  gebaut (Abschnitt 14, Punkt 1). Ein Test für die Ablehnung von `<!DOCTYPE` gibt es deshalb
  nicht und kann erst mit dem Parser entstehen.
- Test: keiner.

### I-03 CSV-Formel-Injection im Stundennachweis (Tampering)

- Maßnahme: Stundennachweis-CSV nur über `toCsv` (`apps/api/src/exports/csv.ts`); Projekt- und
  Aufgabennamen, Notizen sind Freitext. Befund B7: Texte, die vollständig
  `^-?\d+([.,]\d+)?$` entsprechen, bekommen kein Hochkomma, damit negative Beträge Zahlen bleiben.
  Alles andere mit führendem `= + - @ \t \r` weiter entschärfen.
- Ort: `apps/api/src/exports/csv.ts` (`SIGNED_DECIMAL`), `apps/api/src/documents/time-report-csv.ts`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/src/exports/csv.spec.ts`: "leaves the signed decimal %j alone" (`-120,00` bleibt
  `-120,00`), "still defuses a leading minus followed by more than a plain number" (`-1+1`) und "turns
  %j into text" (`=HYPERLINK(...)`, `@SUM(A1:A2)`);
  `apps/api/test/exports/time-report.int.spec.ts`: "matches the golden file in the language of a
  german reader" (die Golden-Datei enthält eine Notiz `=SUMME(A1:A3)` als Text).

### I-04 Personaldaten im Stundennachweis für Kunden (Information Disclosure, Befund B9)

- Maßnahme: Eigener Export, nicht `timesheetRows`: nur Projektbuchungen des Kunden bzw. Projekts im
  Zeitraum, keine Abwesenheiten, keine Anwesenheitszeiten, keine Buchungen anderer Kunden. Der
  Stundennachweis kennt keine Beschäftigten: eine Zeile trägt Datum, Projekt, Aufgabe, Notiz, Minuten
  und Abrechenbarkeit (Abschnitt 14, Punkt 5).
- Ort: `apps/api/src/documents/time-report.ts`, `apps/api/src/documents/time-report-pdf.ts`,
  `apps/api/src/documents/time-report-csv.ts`, Routen `GET /exports/time-report` und
  `GET /invoices/:id/time-report`, beide `@Roles('hr')`.
- Priorität: muss
- Status: umgesetzt, mit anderen Routen als im Entwurf (GET statt POST, siehe Z-07).
- Test: `apps/api/src/documents/time-report-pdf.spec.ts`: "never carries an absence type or another
  customer, only the given bookings"; `apps/api/test/exports/time-report.int.spec.ts`: "lists time
  that is not billable in the export only, invoices keep their frozen time".

### I-05 pdfkit liest Dateien oder erzeugt Links aus Daten (Information Disclosure)

`doc.font(src)` und `doc.image(src)` nehmen Dateipfade, `link` erzeugt beliebige URI-Aktionen.

- Maßnahme: Schrift einmal beim Start aus einem festen Pfad als Buffer laden, nie einen Pfad aus
  Daten übergeben. Kein Bild aus Nutzerdaten (kein Logo in Version 1). Keine Link-Annotationen mit
  Nutzer-URLs.
- Ort: `apps/api/src/documents/pdf.ts`, `apps/api/src/documents/fonts.ts`, Schrift unter
  `apps/api/assets/fonts/` (DejaVu Sans mit `LICENSE` und `NOTICE`).
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/src/documents/pdf.spec.ts`: "never opens a /URI action and prints a position text
  with a path literally (I-05)".

### I-06 Zeichen außerhalb der Schrift: PDF zeigt etwas anderes als das XML (Tampering)

PDF/A verlangt eingebettete Schriften. Fehlt ein Glyph, steht im PDF ein Kästchen, im XML der
echte Text.

- Maßnahme: Eine eingebettete TTF mit bekannter Abdeckung (DejaVu Sans, mindestens Latin-1,
  Latin Extended-A, Euro, typografische Anführungszeichen), Lizenz im Ordner der Schrift. Rechnungs-
  Freitexte per zod auf diesen Zeichenvorrat begrenzen (`INVOICE_CHARSET` in
  `packages/shared/src/common.ts`, Fehlerschlüssel `text.invoiceCharset`), dieselbe Grenze gilt fürs XML.
- Ort: `packages/shared/src/common.ts`, `apps/api/assets/fonts/`.
- Priorität: sollte
- Status: umgesetzt. Ein Test, der ein Zeichen wie `Ł` im erzeugten PDF prüft, fehlt.
- Test: `packages/shared/src/text.spec.ts`: "refuses a character the invoice font is not guaranteed to
  show" und "takes ordinary German business text".

### I-07 Metadaten (Information Disclosure, Tampering)

- Maßnahme: Info-Dictionary und XMP nur mit Systemwerten: Titel "Rechnung <Nummer>", Autor
  Firmenname aus dem Snapshot. Keine E-Mail, keine UUID, keine interne ID. XMP nur über eine
  escapende Bibliothek erzeugen, nie per Verkettung.
- Ort: `apps/api/src/documents/pdf.ts` (`escapeXmp`), `apps/api/src/documents/time-report-pdf.ts`.
- Priorität: sollte
- Status: umgesetzt
- Test: `apps/api/src/documents/pdf-layout.spec.ts`: "escapes title and author in the XMP packet and
  keeps the info dictionary readable" und "does the same for the time report";
  `apps/api/src/documents/pdf.spec.ts`: "carries only system-derived metadata, no email or uuid (I-07)".

### I-08 PDF und eingebettetes XML weichen ab (Tampering, Repudiation)

- Maßnahme: Ein berechnetes Rechnungsobjekt, zwei Renderer. Golden-Dateien für XRechnung und
  Factur-X je Fall, ein Paritätstest für die Texte in PDF und XML (beide ziehen sie aus
  `apps/api/src/einvoice/texts.ts`), die XML-Golden-Dateien gegen die KoSIT-Regeln in CI, das
  PDF/A-3 mit veraPDF.
- Ort: `apps/api/test/einvoice/golden/`, `apps/api/test/einvoice/text-parity.spec.ts`,
  `apps/api/test/einvoice/kosit.sh`, `apps/api/test/einvoice/verapdf.sh`, `.github/workflows/ci.yml`.
- Priorität: sollte
- Status: teilweise umgesetzt. Texte in PDF und XML sind gegeneinander geprüft, die XML-Dateien in
  CI gegen KoSIT. Die veraPDF-Prüfung läuft nur lokal (`apps/api/test/einvoice/verapdf.sh`), nicht in CI. Ein Test, der
  Netto, Steuer je Satz und Brutto im PDF-Text und im XML je Golden-Fall gegeneinander hält, fehlt.
- Test: `apps/api/test/einvoice/text-parity.spec.ts`: "prints every XML note and exemption reason in
  the PDF as well", "carries every legal note of the PDF in the XML" und "names no § 13b UStG for an
  EU business, in neither document"; `apps/api/test/einvoice/golden.spec.ts`: "matches the XRechnung
  golden file" und "embeds the Factur-X golden file into the pdf"; CI-Job `einvoice`.

### I-09 Lieferkette pdfkit und `@e-invoice-eu/core` (Tampering, Elevation)

- Maßnahme: Nur den JSON-Eingang der Bibliothek nutzen. Wege über Tabellendateien, YAML-Mappings
  oder LibreOffice (falls die eingesetzte Version sie anbietet) nicht verwenden, LibreOffice nicht
  ins Image. Welche PDF-Bibliothek intern für PDF/A-3 läuft und ob sie gepflegt ist, vor dem Einbau
  prüfen, ebenso die Lizenz. `pnpm audit --prod`, `minimumReleaseAge`,
  Versionen gepinnt.
- Ort: `apps/api/package.json`, `pnpm-workspace.yaml`, `apps/api/Dockerfile`,
  `.github/workflows/ci.yml`.
- Priorität: sollte
- Status: teilweise umgesetzt. Es läuft nur der JSON-Eingang von `@e-invoice-eu/core`
  (`apps/api/src/einvoice/einvoice.ts`), im Image steht kein LibreOffice (das `Dockerfile`
  installiert nur ein `perl-base`-Update), und der CI-Job `audit` prüft die Produktionsabhängigkeiten ab der Stufe high (`pnpm audit`). Nicht umgesetzt: `minimumReleaseAge` ist nicht gesetzt, und
  `apps/api/package.json` nennt Bereiche (`^`), festgelegt sind die Versionen nur über
  `pnpm-lock.yaml`.
- Test: CI-Job `audit` in `.github/workflows/ci.yml`; für das fehlende `soffice` gibt es keinen
  Test.

## 10. K5: Last und Missbrauch

### D-01 Dateigröße und Seitenzahl (Denial of Service)

- Maßnahme: Höchstens 500 Positionen je Entwurf, Längen je Feld (Positionstext 1000 Zeichen),
  Stundennachweis höchstens 366 Tage (`inRange` in `packages/shared/src/common.ts`) und 5000
  Buchungen, nach dem Rendern höchstens 50 Seiten, Dokument höchstens 5 MB (Check in der DB, R-07).
  Das Body-Limit von 100 kB (`apps/api/src/app.ts`) begrenzt Eingaben zusätzlich.
- Ort: `packages/shared/src/billing.ts`, `apps/api/src/invoices/invoices.service.ts`,
  `apps/api/src/documents/render-limit.ts`, `apps/api/src/documents/pdf.ts`,
  `db/migrations/20260926000200_invoices.sql` (Check an `invoice_documents`).
- Priorität: muss
- Status: umgesetzt, mit den Zahlen aus dem folgenden Nachtrag.
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "refuses a 501st position on a draft that
  already carries 500"; `packages/shared/src/time-report-query.spec.ts`: "stops at 367 days";
  `packages/shared/src/billing.spec.ts`: "keeps the description within 1000 characters";
  `apps/api/src/documents/pdf-layout.spec.ts`: "gives up on an invoice at page 51 instead of laying
  out the rest". Das 5-MB-Limit der Dokumente steht als Check in der Datenbank (Tabelle
  `invoice_documents`), ein eigener Test dafür fehlt.

Nachtrag 02.10.2026: Umgesetzt sind höchstens 500 Positionen und 5000 Buchungen je Rechnung
(`MAX_LINES` und `MAX_ENTRIES` in `apps/api/src/invoices/invoices.service.ts`). Die Buchungsgrenze
prüfen Anlegen, Aktualisieren und Ausstellen eines Entwurfs, jeweils mit 400 und
`invoice.tooManyEntries`. `app.issue_invoice` weist eine Rechnung mit mehr als 5000 Buchungen
zusätzlich mit 23514 ab (`db/migrations/20260926001304_invoice_entry_limit.sql`). Ein Stundennachweis-PDF nimmt
höchstens 1800 Buchungen (`MAX_REPORT_ENTRIES`), für mehr bleibt die CSV.

Vorprüfung vor der Nummernvergabe: Vor der Transaktion mit `app.issue_invoice` rendert die API den
Entwurf einmal im Worker im gewählten Format, ohne zu speichern: bei `pdf` das PDF, bei `zugferd`
das PDF/A-3 mit eingebettetem XML, bei `xrechnung` PDF und XML (seit der zweiten Sicherheitsprüfung, N6 in
Abschnitt 16). Scheitert das Rendern der E-Rechnung, bleibt der Entwurf ohne Nummer. Läuft es über 50 Seiten, antwortet
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
  `apps/api/test/invoices/einvoice.int.spec.ts`: "takes no number when the e-invoice of the chosen
  format fails to render";
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
- Ort: `apps/api/src/documents/worker.ts` (Worker-Thread, 5 s, Heap 128 MB),
  `apps/api/src/documents/render-limit.ts` (2 gleichzeitig, Warteschlange 10),
  `apps/api/src/documents/render-limit.guard.ts` (`RenderLimitGuard`, genutzt von Vorschau und
  Stundennachweis; die Ausstellung nutzt dieselbe Warteschlange für die Probe),
  `apps/api/src/invoices/user-rate-limit.guard.ts` (`UserRateLimitGuard`),
  `apps/api/src/documents/documents.service.ts` (Nachrendern, `FAILURE_TTL_MS`).
- Priorität: muss
- Status: umgesetzt. Ein Test, der während laufender Vorschauen die Antwortzeit von `GET /health`
  misst, fehlt.
- Test: `apps/api/test/documents/run-in-thread.spec.ts`: "ends an endless loop after the timeout and
  terminates the thread" und "runs out of memory inside its own heap limit";
  `apps/api/src/documents/render-limit.spec.ts`: "runs at most two jobs at once and queues a third
  until a slot frees" und "rejects with RenderBusyError once the queue is full, without touching the
  active jobs"; `apps/api/test/invoices/render.int.spec.ts`: "answers 503 with Retry-After on the real
  route once the render pool and its queue are both full";
  `apps/api/test/invoices/einvoice.int.spec.ts`: "renders and stores the missing document on the first
  download".

### D-03 Entwurfsvorschau als echte Rechnung verwenden (Spoofing, Repudiation)

Eine Vorschau ohne Nummer, die an einen Kunden geht, ist ein Beleg ohne Aufzeichnung.

- Maßnahme: Vorschau-PDFs tragen auf jeder Seite "Entwurf – keine Rechnung", keine Nummer, kein XML
  für Entwürfe, werden nicht gespeichert.
- Ort: `apps/api/src/documents/pdf.ts`, `apps/api/src/documents/labels.ts` (`draftWatermark`),
  `apps/api/src/invoices/invoices.service.ts` (`previewPdf`).
- Priorität: muss
- Status: umgesetzt. Die Vorschau ist eine GET-Route (siehe Nachtrag zu Z-07), ausgestellte
  Rechnungen haben keine Vorschau (409), ein Entwurf hat weder Dokument noch XML.
- Test: `apps/api/src/documents/pdf.spec.ts`: "marks a draft with the draft watermark and no invoice
  number field"; `apps/api/test/invoices/acceptance.int.spec.ts`: "has no preview";
  `apps/api/test/invoices/einvoice.int.spec.ts`: "serves neither document nor xml of a draft".

### Rate-Limits (umgesetzt)

Globales Limit bleibt 300/min je IP. "Nutzer" heißt Zählung je `userId` über den `UserRateLimitGuard`
(`apps/api/src/invoices/user-rate-limit.guard.ts`, Zähler in `ops.rate_limits`). Live und Demo
haben dieselben Limits.

| Route                                                       | Limit                          | Zählung |
| ----------------------------------------------------------- | ------------------------------ | ------- |
| `POST /invoices/drafts`                                     | 30/min                         | Nutzer  |
| `PATCH /invoices/:id` und die drei Positionsrouten zusammen | 60/min                         | Nutzer  |
| `POST /invoices/:id/refresh`                                | 10/min                         | Nutzer  |
| `GET /invoices/:id/preview.pdf`                             | 20/min                         | Nutzer  |
| `POST /invoices/:id/issue`                                  | 30/h                           | Nutzer  |
| `POST /invoices/:id/cancel`                                 | 10/h                           | Nutzer  |
| `POST /invoices/:id/paid` und `/unpaid` zusammen            | 30/min                         | Nutzer  |
| `GET /invoices/:id/time-report`                             | 20/min                         | Nutzer  |
| `GET /exports/time-report`                                  | 20/min                         | Nutzer  |
| `PATCH /billing/profile`                                    | 10/h                           | Nutzer  |
| `GET /invoices/:id/document`, `GET /invoices/:id/xml`       | nur global                     | IP      |
| `POST /project-timer/start`, `POST /project-timer/stop`     | nur global, kein eigenes Limit | IP      |
| Renderings gleichzeitig                                     | 2 je Prozess, Warteschlange 10 | Prozess |

Gegenüber dem Entwurf gibt es drei Abweichungen. Die Routen heißen anders, und rendernde Routen sind
GET (Nachtrag zu Z-07). Ein Tageslimit je Sandbox (100 Vorschauen) und ein Limit für den
Projekt-Timer gibt es nicht; die Sandbox begrenzen die Kontingente aus X-03 und das Limit beim
Anlegen von Sandboxes. Die Route `PUT /invoice-series/:series/start` und ihr Limit entfallen mit N-02.
`POST /invoices/:id/refresh` und die Bearbeitung der Entwürfe kamen aus der zweiten
Sicherheitsprüfung (Abschnitt 16, N4) dazu.

- Status: umgesetzt, mit den genannten Abweichungen.
- Test: `apps/api/test/invoices/acceptance.int.spec.ts`: "stops $route after $limit calls of one
  person, nobody else" (Entwurf anlegen, Vorschau, Ausstellen, Stornieren, Neueinlesen, Entwurf
  bearbeiten); `apps/api/test/invoices/rate-limits.int.spec.ts`: "stops $route after 20 calls a
  minute of one person" und "counts paid and unpaid together, 30 a minute";
  `apps/api/test/billing/billing.int.spec.ts`: "allows ten changes an hour per admin, then answers
  429 with Retry-After".

## 11. K3: Timer, Projektzeiten, Rundung

### T-01 Zeit per Client-Uhr setzen (Tampering)

- Maßnahme: `POST /project-timer/start` nimmt als strenges Schema nur `projectId`, `taskId` und
  `note` (`startTimerSchema`), `POST /project-timer/stop` nur `note`; eine Zeit kann der Client
  nicht mitschicken. Guard-Trigger auf `app.project_entries` (`app.guard_project_entry()`) nach
  dem Muster von `app.guard_time_entry()`: bei `source = 'timer'` muss `started_at = now()` beim
  INSERT und `ended_at = now()` beim Stoppen sein (sonst `check_violation`, 23514).
- Ort: `db/migrations/20260926000100_projects.sql`,
  `db/migrations/20260926000980_project_entry_hardening.sql`,
  `apps/api/src/projects/project-timer.controller.ts`, `packages/shared/src/projects.ts`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/projects.int.spec.ts`: "starts a timer with the time of the database" und
  "refuses a timer with a time from the client" (23514); `apps/api/test/projects/project-timer.int.spec.ts`:
  "takes neither a start time nor an unknown field" und "starts, reports and stops a timer on the clock
  of the database".

### T-02 Timer läuft über Tage (Tampering)

- Maßnahme: Partieller Unique-Index "ein laufender Timer je Person"
  (`project_entries_one_running_idx`, `where ended_at is null and voided_at is null`). Manuelle
  Buchungen per Check höchstens 24 h (in `app.guard_project_entry()`). Hinweis am laufenden Timer
  ab 12 h (`TIMER_HINT_AFTER_MINUTES` in `packages/rules/src/projects/index.ts`; der Entwurf nannte
  10 h). Die Behandlung von Timer-Buchungen über 12 h beim Abrechnen weicht vom Entwurf ab (Nachtrag).
- Ort: `db/migrations/20260926000100_projects.sql`, `packages/rules/src/projects/index.ts`,
  `packages/rules/src/billing/long-entries.ts`, `apps/api/src/invoices/invoices.service.ts`,
  `apps/web/src/features/billing/issue-dialog.tsx`.
- Priorität: muss (Index, Ausschluss aus Entwürfen), sollte (Hinweis)
- Status: teilweise umgesetzt. Index, 24-h-Check und Hinweis stehen; der Ausschluss aus Entwürfen
  ist nicht umgesetzt, an seine Stelle tritt die Sperre beim Ausstellen (Nachtrag).
- Test: `apps/api/test/db/projects.int.spec.ts`: "reports a second running timer on the one-running
  index" und "caps a manual entry at 24 hours"; `apps/api/test/projects/project-timer.int.spec.ts`:
  "leaves one running timer after two starts at the same time" und "hints at a timer that has run
  for twelve hours".

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
WHERE (voided_at IS NULL)` wie auf `app.time_entries` (Constraint `project_entries_no_overlap`).
- Ort: `db/migrations/20260926000100_projects.sql`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/db/projects.int.spec.ts`: "rejects overlapping entries" (23P01);
  `apps/api/test/projects/project-entries.int.spec.ts`: "refuses an entry that overlaps another one"
  und "refuses a change that moves an entry onto another one" (409 `TIME_OVERLAP`).

### T-04 Manuelle Zeiten in Zukunft, gesperrten Monaten, abgerechneten Zeiträumen (Tampering)

- Maßnahme: Trigger prüft `ended_at <= now()` (`app.guard_project_entry()`, `check_violation`).
  Im Betrieb war `app.enforce_period_lock('workday')` auf `app.project_entries` vorgesehen; ein
  solcher Trigger existiert nicht, Projektbuchungen in einem abgeschlossenen Monat sind also nicht
  gesperrt. Abrechnungssperre aus R-09.
- Ort: `db/migrations/20260926000980_project_entry_hardening.sql`.
- Priorität: muss
- Status: teilweise umgesetzt. Zukunftssperre und Abrechnungssperre stehen. Offen ist die Sperre
  gesperrter Monate für Projektbuchungen, und für die Zukunftssperre fehlt ein Test.
- Test: für die Abrechnungssperre siehe R-09; `apps/api/test/db/projects.int.spec.ts`: "freezes an
  invoiced entry and leaves the invoice to hr".

### T-05 Projektzeit außerhalb der Arbeitszeit im Betrieb (Tampering)

- Maßnahme: Umgesetzt als Hinweis, nicht als Sperre (Entscheidung: Abweichung nur anzeigen, ADR
  0002). `projectCoverage` in `@zeit/rules` meldet je Tag `PROJECT_OVER_WORKED` (mehr Projektzeit
  als gestempelte Zeit) und `PROJECT_OUTSIDE_WORK` (Projektzeit außerhalb der Stempelzeit), mit
  fünf Minuten Toleranz; Wochenmatrix und Teamansicht zeigen es. Es gibt keinen 409 bei der Buchung
  und keinen Punkt auf der Monatsabschluss-Checkliste.
- Ort: `packages/rules/src/projects/index.ts`, `apps/api/src/projects/project-engine.ts`,
  `apps/api/src/projects/project-week.service.ts`.
- Priorität: sollte
- Status: teilweise umgesetzt. Der Hinweis steht, die harte Prüfung und der Abschlusspunkt sind
  nicht umgesetzt.
- Test: `packages/rules/src/projects/index.spec.ts`: "flags more project time than time worked" und
  "finds project time before the first and after the last stamp";
  `apps/api/test/projects/project-week.int.spec.ts`: "flags project time beyond and outside the
  stamped time, in the week and the team view".

### T-06 Rundungsmissbrauch (Tampering)

Angriff: Zehn Buchungen zu je einer Minute, jede auf 15 Minuten aufgerundet, ergeben 150 Minuten.

- Maßnahme: Gerundet wird die Summe je Zelle (Tag, Aufgabe, Person, Abrechenbarkeit), nie die
  einzelne Buchung (`aggregate` in `@zeit/rules`); die Zeitposition summiert die gerundeten
  Minuten ihrer Zellen. Rechenkern als reine Funktionen in `packages/rules/src/billing/`, Geld in
  ganzen Cent als `bigint` (ADR 0003), nie `number` mit Nachkommastellen. Check auf
  `app.invoice_lines`: `net_cents = round_div(minutes * unit_price_cents, 60)` bzw.
  `round_div(quantity_milli * unit_price_cents, 1000)` (`invoice_lines_net_cents`);
  `app.issue_invoice` rechnet die Summen nach. Rundungsregel, Schritt und die Herleitung stehen
  je Position in `derivation` (`jsonb`), neben der abgerechneten Menge steht die exakte
  Minutenzahl. Rundung je Position gegenüber Gesamtbetrag ist mit der Steuerberatung zu klären
  (`docs/rechnungen-recht.md`, offener Punkt 1).
- Ort: `packages/rules/src/billing/index.ts`, `packages/rules/src/money/index.ts`,
  `db/migrations/20260926001101_invoice_line_checks.sql`.
- Priorität: muss
- Status: umgesetzt. Die steuerliche Bestätigung der Rundungsart steht aus (Abschnitt 14, Punkt 7), die Technik ist fertig.
- Test: `packages/rules/src/billing/index.spec.ts` (fast-check): "splitting a booking into pieces
  changes neither the billed minutes nor the amount (T-06)" und "rounding up adds at most one
  increment minus a minute (T-06)"; "rounds the sum of a cell, not every single entry";
  `apps/api/test/db/invoice-hardening.int.spec.ts`: "takes only the net amount that follows from
  quantity and price, rounded half away from zero".

### T-07 Stundensatz rückwirkend ändern (Tampering)

- Maßnahme: `app.rates` mit `valid_from`, kein UPDATE, DELETE nur für Sätze, die noch nicht gelten
  (Policy "hr removes future rates"); ein Satz gilt ab seinem Datum, maßgeblich ist das
  Leistungsdatum der Buchung (`resolveRate`, Abschnitt 14, Punkt 8). Ausgestellte Rechnungen tragen
  den Satz in `unit_price_cents` der Position und in `derivation`; die Position ist nach dem
  Ausstellen gesperrt (R-01). Ein neuer Satz ändert damit keine ausgestellte Rechnung.
- Ort: `db/migrations/20260926000100_projects.sql`, `packages/rules/src/billing/index.ts`.
- Priorität: sollte
- Status: umgesetzt. Ein Test, der nach einem neuen Satz die Positionen einer ausgestellten
  Rechnung vergleicht, fehlt; belegt sind die Sperre der Positionen und die Regel zur Satzwahl.
- Test: `packages/rules/src/billing/index.spec.ts`: "takes the newest rate of a level that has
  started by the day of service"; `apps/api/test/projects/projects.int.spec.ts`: "removes a rate only
  before it takes effect"; `apps/api/test/db/invoice-acceptance.int.spec.ts`: "refuses every column
  but status and payment to the superuser with ZT002".

## 12. Datenschutz, Aufbewahrung, Protokoll, Step-up

### P-01 Personenbezogene Daten in Rechnungen

Betroffen: Kunden als natürliche Personen (B2C), Ansprechpartner, die Freelancerin selbst (die
Geschäftsanschrift ist oft die Wohnanschrift), Beschäftigte im Stundennachweis, IBAN.
Rechtsgrundlagen: Art. 6 Abs. 1 lit. b DSGVO (Vertrag), lit. c (Aufbewahrung nach § 147 AO,
§ 257 HGB), bei Beschäftigten § 26 BDSG.

- Maßnahme: Eintrag im Verzeichnis der Verarbeitungstätigkeiten;
  Datenminimierung je Feld (keine Geburtsdaten, keine privaten Telefonnummern im Kundenstamm);
  pino loggt keine Bodies und keine Dokumente (`apps/api/src/common/logging.ts`, Anfragen mit
  pseudonymisierter Adresse und geschwärzten Kopfzeilen, Passwörtern und Token); Fehlermeldungen
  aus pdfkit oder `@e-invoice-eu/core` gehen ohne Inhalt ins Log.
- Ort: `apps/api/src/common/logging.ts`, `apps/api/src/invoices/invoices.service.ts` (Warnung
  nach dem Ausstellen nennt nur Rechnungs-ID und Fehler).
- Priorität: muss
- Status: teilweise umgesetzt. Das Logging schreibt keine Bodies und keine Dokumente. Die Stammdaten
  des Kunden beschränken sich auf Name, Anschrift, E-Mail, USt-IdNr., Kundennummer und Käuferreferenz. Offen ist der Eintrag im
  Verzeichnis der Verarbeitungstätigkeiten; im Repository gibt es kein solches Dokument. Ein Test
  über das mitgeschnittene Log einer Ausstellung fehlt.
- Test: `apps/api/src/common/logging.spec.ts`: "writes neither the proxy nor the visitor behind it
  in full" (Adresse im Anfrage-Log); ein Test mit Kundennamen und IBAN im Log fehlt.

### P-02 Aufbewahrung gegen Löschung

- Maßnahme: `retain_until` ist eine generierte Spalte, `make_date(number_year + 8, 12, 31)`
  (Ende des achten Jahres nach dem Rechnungsjahr). In Version 1 gibt es keinen Löschweg für
  Rechnungen. Ein Kunde mit Rechnungen wird nicht gelöscht, sondern gesperrt: `DELETE /clients/:id`
  (nur `admin`, mit Step-up) antwortet 204 und setzt `restricted_at` (Einschränkung nach Art. 18
  DSGVO: aus Listen und Auswahl genommen, die Rechnung bleibt lesbar); in der Datenbank scheitert
  ein DELETE auf einen Kunden mit Rechnung mit 23503. Archivieren (`archived_at`) gibt es zusätzlich
  für Kunden und Projekte. Kunden ohne Rechnung und ohne Projekte werden gelöscht. Live-Mandanten
  sind nicht löschbar (R-04). Ein Löschpfad für Zeitbuchungen fehlt bis zur Klärung
  (`docs/rechnungen-recht.md`, offener Punkt 4). Sandbox-Daten gehen nach 24 h komplett, das ist
  zulässig, weil dort keine echten Rechnungen entstehen (X-01).
- Ort: `db/migrations/20260926000200_invoices.sql` (`retain_until`),
  `db/migrations/20260926001104_tenant_retention_definer.sql`, `apps/api/src/projects/projects.service.ts`.
- Priorität: muss
- Status: umgesetzt. Ein Test, der den Wert von `retain_until` für ein festes Rechnungsdatum prüft,
  fehlt; geprüft ist das Verhalten rund um die Frist.
- Test: `apps/api/test/db/invoice-acceptance.int.spec.ts`: "drops a draft but keeps a client that has
  an invoice" (23503) und "holds a live tenant through the purge path even without the general delete
  guard, until retain_until"; `apps/api/test/invoices/acceptance.int.spec.ts`: "is locked away instead
  of deleted, and its invoice stays readable"; `apps/api/test/projects/projects.int.spec.ts`: "deletes
  a client without projects and locks one with projects away".

### P-03 Protokoll bei Ausstellung, Storno, Zahlungsstatus (Repudiation)

- Maßnahme: `audit.track()` auf jeder neuen Tabelle; alle 28 Tabellen in `app` tragen einen Trigger
  `audit_<tabelle>`. App-Ereignisse mit IP für Ausstellung, Storno, Zahlung und Stammdatenwechsel
  werden innerhalb derselben `withTenant`-Transaktion geschrieben, nicht über `Audit.record`
  (Befund B4). `audit.track()` überspringt bei `invoices` die Spalten `seller` und `buyer` und bei
  `invoice_documents` die Spalte `content` (Befund B5), damit weder PDF noch Adressblock im
  append-only Protokoll landen; bei `billing_profiles` bleiben von IBAN und BIC die letzten vier Stellen.
- Ort: `db/migrations/20260926001000_invoice_audit_redaction.sql` (`audit.track()`),
  `apps/api/src/invoices/invoices.store.ts` und `apps/api/src/billing/billing.store.ts` (`logEvent`).
- Priorität: muss
- Status: umgesetzt. Zwei Tests fehlen: ein Meta-Test, der für jede Tabelle in `app` den Trigger
  verlangt (belegt nur durch den Stand von `db/schema.sql`), und einer für die App-Ereignisse
  `invoice.issued`, `invoice.cancelled` und `invoice.paid` samt IP.
- Test: `apps/api/test/invoices/invoices.int.spec.ts`: "leaves the pdf content out of a stored
  document audit row"; `apps/api/test/billing/billing.int.spec.ts`: "redacts the iban in the database
  trigger audit row too, not just the app-level one" und "upserts the profile, mails every admin on
  an iban change and protects the field" (App-Ereignis `billing_profile.updated` ohne IBAN);
  `apps/api/test/db/invoice-hardening.int.spec.ts`: "logs every step of the counter, for admins and
  the issuer only".

| Ereignis                                    | Quelle                                                                  | Inhalt                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Rechnung ausgestellt                        | Trigger auf `app.invoices` + App-Ereignis `invoice.issued` mit IP       | Nummer, Art, Summen, Kunde, Leistungszeitraum, Format (ohne `seller` und `buyer`) |
| Stornorechnung                              | Trigger + App-Ereignis `invoice.cancelled` mit IP                       | Storno-Nummer, Bezug, `cancel_reason` im Trigger-Diff                             |
| Dokument gespeichert                        | Trigger auf `app.invoice_documents`                                     | Format, sha256 (ohne `content`)                                                   |
| Zahlung erfasst oder zurückgenommen         | Trigger auf `app.invoices` + `invoice.paid` und `invoice.unpaid` mit IP | `status`, `paid_on`                                                               |
| Rechnungsstammdaten geändert                | Trigger + App-Ereignis `billing_profile.updated` mit IP                 | geänderte Felder, IBAN und BIC nur letzte vier Stellen                            |
| Nummernkreis                                | Trigger auf `app.invoice_counters`                                      | `last_seq` je Schritt (kein Startwert, siehe N-02)                                |
| Satz angelegt                               | Trigger auf `app.rates`                                                 | Projekt/Aufgabe, Satz, gültig ab                                                  |
| Projektbuchung durch andere Person geändert | Trigger, `subject_employee_id` gesetzt                                  | Diff                                                                              |
| Kunde archiviert oder gelöscht              | Trigger                                                                 | beim Löschen die ganze Zeile (P-05 offen)                                         |

### P-04 HR liest Rechnungsdaten im Protokoll (Information Disclosure, Befund B6)

- Maßnahme: Policy "hr and admins read the trail" so ändern, dass `hr` Einträge der Tabellen
  `invoices`, `invoice_lines`, `invoice_line_entries`, `invoice_documents`, `invoice_counters`,
  `rates`, `clients` und `billing_profiles` nicht liest (der Entwurf nannte `invoice_payments` und
  `customers`).
- Ort: `db/migrations/20260926000200_invoices.sql`.
- Priorität: sollte
- Status: umgesetzt. Ein Test über `GET /audit` mit der Tabelle `invoices` fehlt, belegt ist die
  Policy für `invoice_counters`.
- Test: `apps/api/test/db/invoice-hardening.int.spec.ts`: "logs every step of the counter, for
  admins and the issuer only" (eine andere HR-Person sieht 0 Einträge, die Administration 2).

### P-05 Gelöschte Kunden leben im Protokoll weiter (Information Disclosure)

`audit.track()` schreibt beim DELETE die alte Zeile ins Diff; das Protokoll wird nie gelöscht.

- Maßnahme: Für `clients` beim DELETE nur die ID protokollieren. Langfristig ein Löschweg für
  Protokolleinträge nach Ablauf der längsten Aufbewahrungsfrist, als Definer-Funktion mit eigener
  Protokollzeile.
- Ort: `audit.track()` in `db/migrations/20260926001000_invoice_audit_redaction.sql`.
- Priorität: sollte
- Status: offen. `audit.track()` kürzt nur `invoices`, `invoice_documents` und `billing_profiles`;
  beim Löschen eines Kunden steht die ganze alte Zeile mit Name und Anschrift im Protokoll. Mit dem
  Zugriffsschutz von P-04 liest sie nur die Administration und die Person, die gelöscht hat. Ein Löschweg für Protokolleinträge
  existiert nicht.
- Test: keiner.

### Step-up (umgesetzt)

Mechanik wie im Bestand: `@RequireReauth()`, 10 min (`apps/api/src/common/reauth.guard.ts`), in der
Demo ausgesetzt. Die Tabelle zeigt die Umsetzung gegenüber dem Entwurf.

| Aktion                                                                                              | Step-up                                                                                                         | Priorität | Grund                                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Rechnungsstammdaten ändern (Firma, Anschrift, Steuernummer, USt-IdNr., IBAN, BIC, Kleinunternehmer) | ja (`PATCH /billing/profile`, nur `admin`); Info-Mail an alle Administratoren bei einer Änderung der IBAN       | muss      | Ein IBAN-Tausch leitet Zahlungen um, die Identität steht auf jedem Beleg |
| Stornorechnung erstellen                                                                            | ja                                                                                                              | muss      | unumkehrbar, hebt Umsatz auf                                             |
| Nummernkreis-Startwert setzen                                                                       | entfällt, es gibt keinen Startwert (N-02); das Präfix gehört zu den Rechnungsstammdaten und ist damit abgedeckt | muss      | einmalig, prägt die Nummernfolge                                         |
| Komplett-Export aller Rechnungen und Kunden                                                         | entfällt, der Export ist nicht gebaut                                                                           | muss      | der Export enthält den gesamten Bestand                                  |
| Kunde löschen                                                                                       | ja (nur `admin`)                                                                                                | sollte    | Löschung ist unumkehrbar                                                 |
| Kunde archivieren                                                                                   | nein                                                                                                            | sollte    | rückgängig zu machen, nur eine Einschränkung der Liste                   |
| Rechnung ausstellen                                                                                 | ja (Entscheidung vom 25.09.2026: HR und Administration, beide mit Step-up); Bestätigungsdialog                  | muss      | vergibt eine fortlaufende Nummer, nicht umkehrbar außer durch Storno     |
| Zahlung erfassen oder zurücknehmen                                                                  | nein                                                                                                            | –         | protokolliert, Limit 30/min                                              |
| Satz anlegen                                                                                        | nein                                                                                                            | –         | protokolliert, wirkt nur auf neue Entwürfe                               |
| Timer, Projektbuchungen                                                                             | nein                                                                                                            | –         | Routine                                                                  |

- Status: umgesetzt, mit den Abweichungen der Tabelle (Ausstellen mit Step-up, Archivieren ohne,
  kein Startwert, kein Komplett-Export).
- Test: `apps/api/test/invoices/acceptance.int.spec.ts`: "refuses an unconfirmed admin and leaves
  draft, invoice and counter untouched" (Ausstellen und Stornieren); `apps/api/test/billing/billing.int.spec.ts`:
  "wants a fresh confirmation before a change and keeps the profile as it was" und "upserts the
  profile, mails every admin on an iban change and protects the field";
  `apps/api/test/projects/projects.int.spec.ts`: "wants a fresh confirmation before an admin deletes
  and keeps the client".

## 13. K7: Demo

### X-01 Echte Rechnung aus der Demo (Spoofing, Repudiation)

- Maßnahme: `app.issue_invoice` und der Trigger `invoices_mark_specimen` (`app.mark_specimen()`)
  setzen `specimen = true`, wenn `app.tenants.kind = 'sandbox'`, und sonst nie. Die Entscheidung
  hängt an der Datenbank, nicht an `APP_MODE`, damit auch eine falsch konfigurierte Instanz keine
  echte Rechnung aus einer Sandbox erzeugt. Bei `specimen`: Nummer mit Präfix `MUSTER-`, jede
  PDF-Seite mit dem diagonalen Text "Musterrechnung – keine Rechnung im Sinne des § 14 UStG", im XML
  dieselbe Aussage als Rechnungshinweis (BT-22). Verkäufer ist der erfundene Musterbetrieb mit
  einer USt-IdNr., die die deutsche Prüfziffer nicht besteht, und einer IBAN mit falscher
  Prüfziffer, damit weder Steuerabzug noch Überweisung funktionieren.
- Ort: `app.issue_invoice` und `app.mark_specimen` in `db/schema.sql`,
  `db/migrations/20260926001200_invoice_draft_specimen.sql`, `apps/api/src/documents/pdf.ts`,
  `apps/api/src/einvoice/texts.ts`, `packages/demo-data/src/invoices.ts`.
- Priorität: muss
- Status: umgesetzt
- Test: `apps/api/test/invoices/acceptance.int.spec.ts`: "marks preview and document of a sandbox
  invoice by tenants.kind, with APP_MODE=test" und "never marks the invoice of a live tenant";
  `apps/api/src/documents/pdf.spec.ts`: "marks a sandbox invoice with the specimen watermark (X-01)";
  `apps/api/test/einvoice/einvoice.spec.ts`: "marks a sandbox invoice as specimen in a note, in the
  language of the invoice (X-01)"; `apps/api/test/demo/invoices.int.spec.ts`: "marks every invoice as
  specimen" und "puts only made-up data on the billing profiles and every frozen seller of a
  sandbox".

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
  `apps/api/src/billing/billing.controller.ts`, Trigger `billing_profiles_guard`
  (`app.guard_billing_profile()`, `db/migrations/20260926001302_sandbox_profile_guard.sql`) als
  Absicherung in der Datenbank, `apps/web/src/features/billing/settings-page.tsx`.
- Priorität: muss
- Status: umgesetzt, in der API und zusätzlich im Datenbank-Trigger.
- Test: `apps/api/test/billing/billing.int.spec.ts`: "switches the tax profile and refuses every
  other change with 403", "leaves a live tenant free to change its seller details" und "allows ten
  changes an hour per admin, then answers 429 with Retry-After";
  `apps/api/test/db/sandbox-profile.int.spec.ts`: "refuses a change of the $field" und "switches tax
  profile and previous year revenue, also through the upsert";
  `apps/web/src/features/billing/settings-page.spec.tsx`: "leaves only the tax profile and the
  previous year revenue open in the demo".

### X-03 Spam-PDFs und Speicher in Sandboxes (Denial of Service)

- Maßnahme: Kontingente je Sandbox per Trigger `app.sandbox_quota(n)` (nur `kind = 'sandbox'`, Fehler
  ZT005, API: 409 `SANDBOX_QUOTA`): 50 Kunden, 100 Projekte, 300 Aufgaben, 200 Sätze, 20000
  Projektbuchungen, 80 Zeilen in `app.invoices` (Entwürfe und Stornorechnungen
  eingeschlossen) und 2000 Positionen. Dazu höchstens 30 ausgestellte Rechnungen, geprüft in
  `app.issue_invoice` (ZT005); das Stornieren einer davon bleibt möglich. Render-Limits aus
  Abschnitt 10, ein Dokument höchstens 5 MB. Der Entwurf nannte den Fehlercode `SANDBOX_LIMIT`;
  der Code gehört zum Limit beim Anlegen von Sandboxes. Der Purge räumt abgelaufene Sandboxes ab.
- Ort: `db/migrations/20260926000200_invoices.sql` (`invoices_sandbox_quota`),
  `db/migrations/20260926000120_sandbox_projects.sql`, `db/migrations/20260926001307_invoice_lines_sandbox_quota.sql`,
  `app.issue_invoice` in `db/schema.sql`.
- Priorität: muss
- Status: teilweise umgesetzt. Nicht umgesetzt sind das Kontingent von 50 Entwürfen (es gilt die
  Obergrenze von 80 Zeilen in `app.invoices`) und die Summengrenze von 20 MB.
- Test: `apps/api/test/db/invoice-legacy.int.spec.ts`: "stop at 30, and one of them can still be
  cancelled there"; `apps/api/test/db/sandbox.int.spec.ts`: "caps the clients of a sandbox and counts
  its project entries" und "caps the invoice lines of a sandbox at 2000";
  `apps/api/test/demo/capacity.int.spec.ts`: "refuses the next one with 503 until the purge frees a
  slot".

Nachtrag 02.10.2026: Rechnungspositionen haben seit der zweiten Sicherheitsprüfung (N5 in Abschnitt 16) ein eigenes
Kontingent von 2000 je Sandbox (`db/migrations/20260926001307_invoice_lines_sandbox_quota.sql`, 409
`SANDBOX_QUOTA`). Der CSV-Stundennachweis aus einer Sandbox ist wie PDF und Rechnung als Muster
gekennzeichnet (`apps/api/src/documents/time-report-csv.ts`).

## 14. Offene Punkte

Diese Punkte veränderten Maßnahmen und waren vor dem Bau zu klären. Der Stand nach der Umsetzung
steht jeweils am Ende des Punktes.

1. E-Rechnungs-Empfang: `docs/rechnungen-recht.md` führt ihn unter "Muss in Version 1", der feste
   Plan und die Vorgabe "keine Datei-Uploads" nicht. Mit Empfang kommen Upload, XML-Parser und
   PDF-Parser dazu (I-02) und ein eigenes Bedrohungsmodell. Stand: offen. Die Umsetzung hat keinen
   Empfang, keinen Upload und keinen Parser; der Widerspruch zu `docs/rechnungen-recht.md` besteht fort.
2. Wer lädt Freelancer ein: Betreiber per CLI (angenommen) oder ein Betriebs-Admin über die API. Das
   Zweite widerspricht M-03 und braucht eine Definer-Funktion mit eigener Freigabe. Stand:
   entschieden, der Betreiber legt den Solo-Mandanten per CLI an (M-03); im Solo-Bereich antworten
   die Einladungsrouten mit 404 (M-02).
3. Freelancer-Persona: eigener Solo-Sandbox-Mandant (dann M-05) oder Persona im Musterbetrieb.
   Stand: entschieden, eigener Solo-Sandbox-Mandant in einer `sandbox_group` mit dem Betrieb (M-05).
4. Rollen für Rechnungen im Betrieb: nur `admin` (angenommen) oder auch `hr`. Stand: entschieden am
   25.09.2026, HR und Administration, beide mit Step-up.
5. Namen der Beschäftigten im Stundennachweis für Kunden: voller Name, Kürzel oder abschaltbar.
   Stand: entschieden, der Stundennachweis enthält keine Beschäftigtenangabe (I-04).
6. Zeichenvorrat der Rechnungsschrift (I-06). Stand: entschieden und umgesetzt, Latin-1,
   Latin Extended-A, Euro und typografische Zeichen (`INVOICE_CHARSET`).
7. Rundung je Position oder auf den Gesamtbetrag (`docs/rechnungen-recht.md`, offener Punkt 1).
   Stand: technisch entschieden, Minuten je Zelle gerundet, Steuer je Steuersatzgruppe aus der
   Nettosumme (ADR 0003); die Bestätigung durch die Steuerberatung ist offen.
8. Stichtag des Stundensatzes: Leistungsdatum oder Rechnungsdatum. Stand: entschieden, es gilt das
   Leistungsdatum der Buchung (T-07).
9. Aufbewahrung der Zeitbuchungen hinter Rechnungen (`docs/rechnungen-recht.md`, offener Punkt 4).
   Stand: offen. Projektbuchungen werden nie gelöscht, nur storniert; einen kürzeren Löschzyklus
   gibt es nicht, bis die Steuerberatung die Einordnung klärt.

## 15. Die zehn wichtigsten Maßnahmen

Mit dem Stand der Umsetzung; Abweichungen vom Entwurf stehen in den genannten Abschnitten.

1. Ausgestellte Rechnungen, Positionen und Dokumente sind für `zeit_app` nach dem Ausstellen nicht
   mehr änderbar (Trigger `guard_invoice`, `guard_invoice_child`, Dokumente append-only);
   Ausstellung nur über `app.issue_invoice` mit Serverdatum, serverseitigen Summen und
   Schnappschuss von Verkäufer und Käufer (R-01, R-02, R-06, N-03). Teilweise umgesetzt: kein
   TRUNCATE-Trigger auf Positionen und Buchungszuordnung.
2. Nummernvergabe per Zähler-Upsert in derselben Transaktion, Unique-Constraints, Test mit 20
   parallelen Ausstellungen (N-01, N-02). Umgesetzt, ohne Startwert-Funktion.
3. Purge-Ausnahme nur für `zeit_system` und `zeit_owner`, Live-Mandanten unlöschbar (R-03, R-04).
   Umgesetzt.
4. Abrechnungssperre über `project_entries.invoice_id` mit Sperr-Triggern (ZT004); Storno nur über
   `app.invoice_cancel` mit Step-up (R-08, R-09). Umgesetzt, die Sperre hängt an einer Spalte
   statt an einer Tabelle `invoice_entries`.
5. Mandantentyp (`workspace`) unveränderlich, keine Solo-Ausnahmen in bestehenden Guards,
   Ein-Personen-Trigger mit Advisory-Lock (M-01, M-02). Umgesetzt.
6. Neue Tabellen im RLS-Meta-Test und in der Rollen-Matrix, Sätze und Rechnungen für HR und
   Administration, Definer-Funktionen filtern selbst nach Mandant, Step-up für Rechnungsstammdaten,
   Ausstellen und Storno (Z-01, Z-02, Abschnitt 12). Umgesetzt.
7. Rendern im Worker mit Zeit-, Seiten-, Größen- und Parallelitätsgrenze, nie innerhalb einer
   DB-Transaktion, Limits je Nutzer über einen Guard auf Routenebene (D-01, D-02). Umgesetzt.
8. XML nur über den Builder, Textschema um U+FFFE, U+FFFF und Surrogate erweitert, CSV über
   `toCsv` mit Ausnahme für Dezimalzahlen, Stundennachweis ohne HR-Daten (I-01, I-03, I-04).
   Umgesetzt.
9. Timer nur mit DB-Zeit, EXCLUDE gegen Überlappung, Rundung je Zelle mit Property-Tests (T-01,
   T-03, T-06). Umgesetzt.
10. Demo: `specimen` aus `tenants.kind`, Wasserzeichen, `MUSTER-`-Präfix, ungültige USt-IdNr. und
    IBAN, gesperrte Rechnungsstammdaten, Kontingente je Sandbox (X-01 bis X-03). Umgesetzt, ohne
    Entwurfs- und Dokumentengrenze (X-03).

Nicht in dieser Liste, aber offen: die Hash-Kette mit externem Abgleich (R-05), der Restore-Schritt
für den Zähler (N-05), die neutrale Einladungsantwort (M-06) und das Kürzen gelöschter Kunden im
Protokoll (P-05).

## 16. Zweite Sicherheitsprüfung 02.10.2026

Zweiter Durchlauf der Sicherheitsprüfung über den Rechnungsteil nach den Härtungen vom 01. und
02.10.2026, danach eine Durchsicht derselben Änderungen. Die Befunde heißen N1 bis N6, nicht zu
verwechseln mit N-01 bis N-05 aus Abschnitt 6. Alle sind behoben, die Tests stehen in der
Tabelle.

| Befund                               | Problem                                                                                                                                                         | Behebung                                                                                                                                                                                                                                                                                                                                                                    | Test                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 veraltete Steuerbehandlung        | Ein Entwurf behielt `tax_treatment` und `tax_profile` vom Anlegen. Änderte sich danach Kunde oder Profil, ging die Rechnung mit der alten Behandlung hinaus.    | Blocker `tax_treatment_stale` und `tax_profile_changed`; "Zeiten neu einlesen" leitet beides neu ab. `app.issue_invoice` prüft mit `app.expected_tax_treatment` dieselbe Regel in SQL; Kunde und Abrechnungsprofil sperrt beim Ausstellen `app.hold_invoice_basis`. Reverse Charge verlangt in der E-Rechnung die USt-IdNr. des Käufers (BR-AE-02, `buyer_vat_id_missing`). | `apps/api/test/invoices/acceptance.int.spec.ts`: "tax treatment of a draft whose client changed", "draft after a change of the tax profile"; `apps/api/test/db/invoice-treatment.int.spec.ts`: "expected tax treatment in sql", "basis of an invoice being issued"; `apps/api/test/einvoice/einvoice.spec.ts`: "wants the vat id of the buyer on reverse charge, BR-AE-02" |
| N2 fehlende Indizes                  | Abrechnungssperre, Freigabe und Stundennachweis suchten über `invoice_line_entries` und `project_entries.invoice_id` ohne Index.                                | Indizes `invoice_line_entries_invoice_idx`, `invoice_line_entries_entry_idx`, partiell `project_entries_invoice_idx` (`db/migrations/20260926001306_invoice_entry_indexes.sql`).                                                                                                                                                                                            | Schema-Drift (`db/schema.sql`)                                                                                                                                                                                                                                                                                                                                             |
| N3 Freigabe beim Neueinlesen         | `refresh` ließ Buchungen am Entwurf hängen, die keine Position mehr ergaben (etwa nach Wegfall des Satzes), und schrieb auch ohne Änderung alle Positionen neu. | `refresh` gibt nur diese Buchungen frei, lässt die übrigen verknüpft und ist ohne Änderung ein No-op; Positionen und Texte bleiben.                                                                                                                                                                                                                                         | `apps/api/test/invoices/acceptance.int.spec.ts`: "refresh of a draft"                                                                                                                                                                                                                                                                                                      |
| N4 Limits je Nutzer                  | `refresh` und die Positionsrouten hatten nur das globale Limit je IP.                                                                                           | `refresh` 10/min, `PATCH /invoices/:id` und die drei Positionsrouten zusammen 60/min je Nutzer.                                                                                                                                                                                                                                                                             | `apps/api/test/invoices/acceptance.int.spec.ts`: "rate limit per person"                                                                                                                                                                                                                                                                                                   |
| N5 Sandbox-Kontingent auf Positionen | Positionen waren nur je Entwurf (500) begrenzt, nicht je Sandbox.                                                                                               | Trigger `invoice_lines_sandbox_quota`, 2000 je Sandbox (`db/migrations/20260926001307_invoice_lines_sandbox_quota.sql`).                                                                                                                                                                                                                                                    | `apps/api/test/db/sandbox.int.spec.ts`: "caps the invoice lines of a sandbox at 2000"                                                                                                                                                                                                                                                                                      |
| N6 Probe-Rendering nur als PDF       | Die Vorprüfung aus D-01 renderte nur das PDF; scheiterte danach die E-Rechnung, war die Nummer schon vergeben.                                                  | Die Probe rendert im gewählten Format inklusive XML.                                                                                                                                                                                                                                                                                                                        | `apps/api/test/invoices/einvoice.int.spec.ts`: "takes no number when the e-invoice of the chosen format fails to render"                                                                                                                                                                                                                                                   |

Dazu aus der Durchsicht: eine Quelle für die Steuerbehandlung in PDF und E-Rechnung
(`apps/api/test/einvoice/text-parity.spec.ts`: "names no § 13b UStG for an EU business, in neither document"),
"Gehen aus der Pause" nur für Stempeluhr-Buchungen des heutigen Tages
(`db/migrations/20260926001310_clock_leave_today_only.sql`, Test "turns only a clock break of today into the end
of the day" in `apps/api/test/db/time-entries.int.spec.ts`), Test-Fixtures nicht mehr im Build.
