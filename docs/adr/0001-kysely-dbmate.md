# 0001 Kysely und dbmate statt ORM

Status: angenommen, 23.09.2026

## Kontext

Ein großer Teil der Fachregeln liegt in PostgreSQL selbst und nicht im Anwendungscode:

- Mandantentrennung über Row Level Security. Die API setzt pro Transaktion `app.tenant_id`, `app.user_id`, `app.role`, `app.employee_id` und `app.request_id` mit `set_config(..., true)`, damit nichts im Pool hängen bleibt.
- Überlappende Buchungen verhindert ein `EXCLUDE USING gist` über `tstzrange`, dazu `btree_gist` und `citext`.
- Journale sind append-only, gesperrte Monate schützt ein Trigger, jede Änderung schreibt `audit.track()` ins Protokoll. Die Anmeldung läuft über `SECURITY DEFINER`-Funktionen mit `search_path = ''`.
- Die API übersetzt Fehlercodes der Datenbank direkt: `23P01` wird `TIME_OVERLAP`, `ZT001` wird `PERIOD_LOCKED`, `ZT002` wird `APPEND_ONLY`.

Nichts davon lässt sich im Schema-Format von Prisma, in TypeORM-Entities oder im TypeScript-Schema von Drizzle vollständig beschreiben. Mit jedem der drei gäbe es also ein Schema im Werkzeug und daneben handgeschriebenes SQL für Policies, Constraints und Trigger, und damit zwei Quellen, die auseinanderlaufen können. Hinzu kommt, dass die Transaktion mit den Sitzungswerten in jedem Request der Normalfall ist und nicht die Ausnahme.

## Entscheidung

- Migrationen schreiben wir als reines SQL und spielen sie mit dbmate ein (`db/migrations`, `dbmate --wait up`). dbmate schreibt nach jedem Lauf `db/schema.sql`, Änderungen am Schema sind damit im Diff lesbar.
- Abfragen laufen über Kysely mit dem Treiber `pg`. Kysely baut SQL, bleibt aber nah daran, und `sql`-Templates binden Werte als Parameter.
- Die Typen der Tabellen erzeugt kysely-codegen aus der migrierten Datenbank. Die Datenbank ist die einzige Quelle für das Schema.
- `sql.raw` und `CompiledQuery.raw` verbietet ESLint, weil beide die Parameterbindung umgehen.

## Folgen

- Constraints, Policies und Trigger stehen dort, wo sie wirken, und lassen sich in `db/test` direkt gegen PostgreSQL testen.
- `withTenant(session, trx => ...)` ist ein kleiner Helfer um `db.transaction()`, ohne Umweg über ein ORM.
- CI prüft Schema-Drift: Migrationen anwenden, codegen laufen lassen, `git diff --exit-code`. Wer eine Migration schreibt, committet die neuen Typen mit.
- Es gibt keine automatisch erzeugten Migrationen. Jede Schemaänderung ist handgeschriebenes SQL mit Review, auch das Rollback.
- Relationen und verschachtelte Ergebnisse baut die API selbst, zum Beispiel mit `jsonArrayFrom` aus `kysely/helpers/postgres`.
