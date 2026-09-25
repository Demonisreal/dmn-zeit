# 0003 Beträge in Cent, Nummernkreis über eine Zähler-Tabelle

Status: angenommen, 24.09.2026

## Kontext

Beträge auf Rechnungen entstehen aus Minuten × Stundensatz ÷ 60, die Steuer aus Bemessungsgrundlage × Steuersatz. Eine Stornorechnung muss die Summen des Originals exakt negieren. Gerechnet wird in `@zeit/rules`, das nur an `temporal-polyfill` hängt (`docs/planung.md`, Abhängigkeiten). Mehrwährung ist nicht in Version 1, alle Beträge sind Euro.

Die Rechnungsnummer muss fortlaufend und einmalig sein (§ 14 Abs. 4 Nr. 4 UStG). Lückenlos verlangt die Finanzverwaltung nicht, mehrere Nummernkreise sind zulässig (`docs/rechnungen-recht.md`, Abschnitt 2). Vergeben wird unter Nebenläufigkeit: Zwei Ausstellungen desselben Mandanten dürfen nie dieselbe Nummer bekommen, und eine Ausstellung, die nach der Vergabe scheitert, etwa beim Rendern des PDF, soll keine Nummer verbrauchen.

## Entscheidung

Beträge:

- Geld ist immer eine Ganzzahl in Cent: `bigint` in der Datenbank (`rate_cents`, `unit_price_cents`, `net_cents`, `tax_cents`, `gross_cents`), natives `bigint` in `@zeit/rules`. Steuersätze stehen in Basispunkten (`tax_rate_bp`, 1900 = 19 %), Mengen freier Positionen in Tausendsteln (`quantity_milli`), Zeitpositionen in Minuten.
- `money/roundDiv` rundet kaufmännisch halb vom Nullpunkt weg, damit eine Stornorechnung spiegelbildlich rundet. Netto einer Zeitposition: `roundDiv(Σ gerundete Minuten × Satz, 60)`.
- Steuer je Steuersatzgruppe aus der Summe der gerundeten Nettobeträge, brutto = Σ netto + Σ Steuer. Das ist die Empfehlung aus `docs/rechnungen-recht.md`, Abschnitt 5, und deckt sich mit EN 16931 BR-CO-17.
- Über die API gehen Beträge als String (`centsSchema`, `^-?\d{1,15}$`) wie `dayCountSchema`. kysely-codegen typisiert `Int8` ohnehin als `string`.

Nummernkreis:

- Ein Kreis je Mandant und Jahr, auch für Stornorechnungen. Format: Präfix, Jahr, Bindestrich, laufende Nummer vierstellig mit führenden Nullen, ab 10000 ungekürzt. Beispiel `RE-2026-0007`, ohne Präfix `2026-0007`.
- Der Zähler steht in `app.invoice_counters (tenant_id, year, last_seq)`. Vergeben wird nur in `app.issue_invoice` (SECURITY DEFINER, `zeit_system`) per `insert into app.invoice_counters as c ... on conflict (tenant_id, year) do update set last_seq = c.last_seq + 1 returning c.last_seq`. Der Upsert sperrt die Zeile bis zum Commit, auch beim ersten Beleg eines Jahres.
- Nummer, Ausstellungsdatum und Fälligkeit entstehen in derselben Transaktion wie die gespeicherten Dokumente. Scheitert danach etwas, gibt der Rollback die Nummer zurück.
- `zeit_app` darf den Zähler nur lesen und hat kein Spalten-Grant auf `number*`, `issue_date` und `issued_*`. Wegen `check ((status = 'draft') = (number is null))` scheitert auch ein direktes `update ... set status = 'issued'`. Dazu `unique (tenant_id, number)` und `unique (tenant_id, number_year, number_seq)`.

## Verworfen

- Dezimalzahlen als `number`: Gleitkomma rechnet Cent nicht exakt (Bedrohungsmodell T-06).
- `numeric` in der Datenbank und eine Dezimalbibliothek in TypeScript (Bedrohungsmodell R-02, R-10): wäre eine neue Abhängigkeit für `@zeit/rules`, und solange es nur Euro gibt, reichen ganze Cent.
- Steuer je Position runden: wäre nach EN 16931 BR-CO-17 ein Validierungsfehler.
- PostgreSQL-Sequenz für die Nummer: `nextval` ist nicht transaktional, jeder Rollback reißt eine Lücke (Bedrohungsmodell N-01).
- Serien innerhalb eines Mandanten (`series` im Bedrohungsmodell): nicht Teil von Version 1, Stornorechnungen laufen im selben Kreis wie Rechnungen.

## Folgen

- Kein Betrag läuft durch Gleitkomma. Formatiert wird erst für die Anzeige (`formatCents` in `apps/web/src/i18n/format.ts`) und im Renderer.
- Property-based Tests: Die Summe einer Stornorechnung ist die exakte Negation des Originals, die Summe der Matrixzellen gleich der Summe der Positionen.
- DB-Tests: 20 parallele Ausstellungen ergeben 1..20 ohne Doppel, ein Rollback verbraucht keine Nummer.
- Ausstellungen desselben Mandanten laufen wegen der Zeilensperre nacheinander, so lange wie die Transaktion dauert, also auch während des Renderns (siehe ADR 0004, Folgen).
- Die Steuerrundung je Satzgruppe muss die Steuerberatung noch bestätigen (`docs/rechnungen-recht.md`, offener Punkt 1).
- Ein Restore auf einen älteren Stand setzt den Zähler zurück. Vor der nächsten Ausstellung ist die zuletzt vergebene Nummer abzugleichen (Bedrohungsmodell N-05).
