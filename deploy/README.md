# Betrieb

Zwei getrennte Compose-Projekte auf demselben Server: `deploy/demo` und `deploy/live`. Beide
bauen `zeit-api` und `zeit-web` aus `apps/api` bzw. `apps/web`, ziehen `postgres:17-alpine` und
legen die Rollen über `db/init/00-roles.sh` an. Details zu Netzen, Härtung und Migrationsdienst
stehen in `docs/planung.md`, Abschnitt "Betrieb".

## Erstinstallation

Für jede Instanz (`demo` und `live` getrennt ausführen):

1. `cp deploy/<instanz>/.env.example deploy/<instanz>/.env`, danach
   `chmod 600 deploy/<instanz>/.env`
2. Secrets erzeugen und eintragen: `openssl rand -hex 32` je Zeile für `POSTGRES_PASSWORD`,
   `ZEIT_OWNER_PASSWORD`, `ZEIT_APP_PASSWORD`. In `live` zusätzlich `ZEIT_BACKUP_PASSWORD` (hex),
   `openssl rand -base64 32` für `PASSWORD_PEPPER` und `DATA_ENCRYPTION_KEY` sowie `MAIL_FROM` und
   `RESEND_API_KEY`, ohne die die API im Live-Modus nicht startet.
3. `APP_ORIGIN` auf die echte Domain der Instanz setzen (die Platzhalter aus `.env.example`
   sind keine echten Domains).
4. `EDGE_NETWORK` auf den Namen des zentralen Caddy-Netzes setzen, vorher mit
   `docker network inspect <name>` prüfen, dass es existiert.
5. `DEMO_APP_SUBNET`/`DEMO_DB_SUBNET` bzw. `LIVE_APP_SUBNET`/`LIVE_DB_SUBNET` gegen
   `docker network inspect` auf Kollisionen mit anderen Projekten auf demselben Server prüfen.
6. `docker compose -f deploy/<instanz>/compose.yml up -d`

Der Migrationsdienst (`zeit-<instanz>-migrate`) läuft dabei automatisch vor der API
(`dbmate --wait up` als `zeit_owner`), die API startet erst nach dessen erfolgreichem Ende.

## Update

1. Neues Image bauen oder ziehen (Tag über `IMAGE_TAG` in der jeweiligen `.env`).
2. Bei `live`: vorher `deploy/live/backup.sh` laufen lassen.
3. `docker compose -f deploy/<instanz>/compose.yml up -d`

Der Migrationsdienst läuft bei jedem `up` erneut, `dbmate` überspringt bereits angewendete
Migrationen selbst. Erst danach wird die API neu gestartet. Reihenfolge nicht von Hand
umgehen (kein `up -d zeit-<instanz>-api` ohne vorherigen `up` des gesamten Projekts).

## Reverse-Proxy des Servers

Die Beispiele unten zeigen nur die Struktur für den bereits vorhandenen, zentralen Caddy des
Servers (nicht `apps/web/Caddyfile`, das steckt im Web-Image). Echte Domains und Pfade stehen
nur in der Konfiguration auf dem Server, nicht im Repo.

```
zeit.example.invalid {
	reverse_proxy zeit-live-web:8080
}

zeit-demo.example.invalid {
	reverse_proxy zeit-demo-web:8080
}
```

Voraussetzung: der zentrale Caddy hängt im selben externen Netz wie `zeit-live-web` bzw.
`zeit-demo-web` (Variable `EDGE_NETWORK` in der jeweiligen `.env`).

Domains zeigen aktuell direkt auf den Server. Ein Schutz gegen DDoS über den Hoster oder
einen vorgeschalteten Proxy ist vor dem eigentlichen Livegang noch zu entscheiden.

## Schlüssel erzeugen

Jedes Secret in `.env` einzeln erzeugen, nie wiederverwenden. Die Datenbank-Passwörter als hex,
weil sie unkodiert in `DATABASE_URL` stehen und ein `/` aus base64 die URL zerbricht:

```
openssl rand -hex 32      # POSTGRES_PASSWORD, ZEIT_OWNER_PASSWORD, ZEIT_APP_PASSWORD, ZEIT_BACKUP_PASSWORD
openssl rand -base64 32   # PASSWORD_PEPPER, DATA_ENCRYPTION_KEY (genau 32 Byte)
```

## Backup

Nur `live` wird gesichert. `deploy/live/backup.sh` ruft den Compose-Dienst
`zeit-live-backup` (Profil `backup`, läuft nicht dauerhaft mit) auf, der per `pg_dump` einen
komprimierten Dump nach `BACKUP_DIR` schreibt, und löscht danach Dumps, die älter als
`BACKUP_KEEP_DAYS` (Default 14) Tage sind. Vor jedem Live-Deploy und zusätzlich über Cron
laufen lassen. Restore-Weg steht als Kommentar im Skript.

Der Dump läuft als eigene Rolle `zeit_backup` (nur lesend, `BYPASSRLS`), nicht als `zeit_owner`
(Bedrohungsmodell, Befund B11: wer den Backup-Container übernimmt, soll keine Trigger abschalten
oder Daten ändern können). Restore läuft als `postgres` im DB-Container, als `zeit_owner` bricht
`pg_restore` beim Übergeben der Funktionen an `zeit_system` ab.

Ein Restore-Test läuft monatlich gegen eine Wegwerf-Datenbank, nie gegen `zeit-live-db`
direkt.

## Rollback

- **Anwendung:** vorheriges Image-Tag in `IMAGE_TAG` eintragen, dann
  `docker compose -f deploy/<instanz>/compose.yml up -d --no-deps zeit-<instanz>-api` (bzw.
  `zeit-<instanz>-web`). Kein Migrationslauf nötig, solange sich das Schema nicht geändert hat.
- **Datenbank:** nur zurückrollen, wenn die Migration das vorsieht (`dbmate rollback`).
  Riskant, sobald die neue Anwendung bereits Daten im neuen Schema geschrieben hat — dann
  zuerst prüfen, ob die alte Anwendungsversion mit dem aktuellen Schema noch läuft, bevor die
  Migration zurückgenommen wird. Im Zweifel Restore aus dem letzten Backup statt Rollback.
