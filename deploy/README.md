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
4. Eigenes Edge-Netz der Instanz anlegen, bevor `up` läuft (Demo und Live haben getrennte,
   ein gemeinsames Netz für beide würde jeder Instanz Zugriff auf die Rate-Limit-Herkunft der
   anderen geben):
   ```
   docker network create --subnet 172.28.3.0/24 zeit-demo-edge
   docker network create --subnet 172.28.13.0/24 zeit-live-edge
   ```
   `EDGE_NETWORK` und `EDGE_SUBNET` in der `.env` müssen zum jeweils angelegten Netz passen.
   Der zentrale Caddy des Servers muss beide Netze zusätzlich in seiner eigenen Compose als
   `external` einbinden, siehe Abschnitt "Reverse-Proxy des Servers" unten.
5. `DEMO_APP_SUBNET`/`DEMO_DB_SUBNET` bzw. `LIVE_APP_SUBNET`/`LIVE_DB_SUBNET`/`LIVE_EGRESS_SUBNET`
   gegen `docker network inspect` auf Kollisionen mit anderen Projekten auf demselben Server
   prüfen. Sind die 172.28.0.0/16 aus den `.env.example`-Dateien auf dem Server schon durch
   andere Compose-Projekte ohne feste Subnetzangabe belegt, hilft `default-address-pools` in
   `/etc/docker/daemon.json`, damit Docker sie nicht selbst an ein anderes Projekt vergibt.
6. `docker compose -f deploy/<instanz>/compose.yml up -d`
7. Nur bei `live`, vor dem ersten Login: ersten Mandanten anlegen, über den eigenen CLI-Dienst
   (Profil `cli`, läuft nicht mit `up`, verbindet als `zeit_owner`):
   ```
   docker compose -f deploy/live/compose.yml run --rm zeit-live-cli \
     tenant:create --name "<Firma>" --slug <slug> --state <Bundesland, z. B. NW> \
       --admin-email <erste Administration> --admin-name "<Name>"
   ```
   Der Befehl gibt den Einladungslink aus, gültig 7 Tage.

   Einen Solo-Bereich (Freiberufler, genau eine Person, ohne Stempeln, Urlaub und Personal)
   legt derselbe Befehl mit `--workspace solo` an. Dann sind Vor- und Nachname Pflicht, daraus
   entsteht der Personalstamm; `--admin-name` darf fehlen und wird aus beiden gebildet:
   ```
   docker compose -f deploy/live/compose.yml run --rm zeit-live-cli \
     tenant:create --workspace solo \
       --name "<Firma oder Name>" --slug <slug> --state <Bundesland, z. B. NW> \
       --admin-email <E-Mail> --first-name "<Vorname>" --last-name "<Nachname>"
   ```
   Der Mandantentyp lässt sich danach nicht mehr ändern.

Der Migrationsdienst (`zeit-<instanz>-migrate`) läuft dabei automatisch vor der API
(`dbmate --wait up` als `zeit_owner`), die API startet erst nach dessen erfolgreichem Ende.

Vor dem ersten Livegang muss außerdem `security@dmn-software.com` erreichbar sein
(Sicherheitskontakt aus `SECURITY.md`) — ohne Postfach läuft jede Schwachstellenmeldung ins Leere.

## Betreiberbefehle

Beide laufen wie `tenant:create` als `zeit_owner` und schreiben einen Protokolleintrag mit der
Quelle `cli`.

Zweiten Faktor zurücksetzen, wenn niemand im Mandanten es selbst kann (etwa im Solo-Bereich).
Entfernt TOTP, Passkeys, Wiederherstellungscodes und das Passwort und beendet alle Sitzungen.
Zurück kommt die Person nur über einen Link zum Passwortsetzen, 30 Minuten gültig. Der CLI-Dienst
hat kein Internet (Befund M6), die Hinweis-Mail über Resend geht deshalb nicht raus — die
Konsole gibt dann den Link aus, ihn selbst an die Person weitergeben. Ist er abgelaufen, holt
sie sich über „Passwort vergessen“ einen neuen:
```
docker compose -f deploy/live/compose.yml run --rm zeit-live-cli user:mfa-reset --email <E-Mail>
```

Mandanten archivieren: sperrt alle Nutzer und beendet ihre Sitzungen, gelöscht wird nichts
(Aufbewahrungsfristen). Die ID liefert `select id, slug from app.tenants;` als `postgres` in
`docker compose -f deploy/live/compose.yml exec zeit-live-db psql -U postgres -d zeit`:
```
docker compose -f deploy/live/compose.yml run --rm zeit-live-cli tenant:archive --id <uuid>
```

## Update

1. `IMAGE_TAG` in der `.env` der Instanz auf `$(git rev-parse --short HEAD)` setzen, bevor gebaut
   wird. Demo und Live brauchen dabei jeweils ihren eigenen Wert in ihrer eigenen `.env` — sonst
   überschreibt der zweite Build das lokale Image der ersten Instanz unter demselben Tag, und ein
   Rollback über `IMAGE_TAG` in der anderen Instanz geht ins Leere.
2. Image auf einer Build-Maschine bauen, nicht auf dem Server selbst (der Server bekommt kein
   Repo-Checkout mit vollem Build-Werkzeug):
   ```
   docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t zeit-api:$IMAGE_TAG --load .
   docker buildx build --platform linux/amd64 -f apps/web/Dockerfile -t zeit-web:$IMAGE_TAG --load .
   ```
3. Vor dem Übertragen scannen, z. B. `trivy image zeit-api:$IMAGE_TAG` und `trivy image
   zeit-web:$IMAGE_TAG` (dieselben Regeln wie im CI-Job `docker`, severity HIGH,CRITICAL).
4. Auf den Server übertragen, ohne Registry dazwischen:
   ```
   docker save zeit-api:$IMAGE_TAG zeit-web:$IMAGE_TAG | ssh <server> docker load
   ```
5. Bei `live`: vorher `deploy/live/backup.sh` laufen lassen.
6. `docker compose -f deploy/<instanz>/compose.yml up -d --no-build`
   (`--no-build` verhindert, dass Compose auf dem Server versehentlich aus dem dortigen,
   unvollständigen Checkout neu baut statt das übertragene Image zu nehmen)

Der Migrationsdienst läuft bei jedem `up` erneut, `dbmate` überspringt bereits angewendete
Migrationen selbst. Erst danach wird die API neu gestartet. Reihenfolge nicht von Hand
umgehen (kein `up -d zeit-<instanz>-api` ohne vorherigen `up` des gesamten Projekts).

## Reverse-Proxy des Servers

Die Beispiele unten zeigen nur die Struktur für den bereits vorhandenen, zentralen Caddy des
Servers (nicht `apps/web/Caddyfile`, das steckt im Web-Image). Echte Domains und Pfade stehen
nur in der Konfiguration auf dem Server, nicht im Repo.

```
{
	servers {
		timeouts {
			read_header 10s
		}
		max_header_size 16KB
	}
}

zeit.example.invalid {
	reverse_proxy zeit-live-web:8080
}

zeit-demo.example.invalid {
	reverse_proxy zeit-demo-web:8080
}
```

Die globalen Optionen begrenzen langsame und überlange Header, unabhängig von den jeweiligen
Rate-Limits der Instanzen dahinter.

Voraussetzung: der zentrale Caddy hängt in beiden externen Edge-Netzen, `zeit-demo-edge` und
`zeit-live-edge` (je `external: true` in seiner eigenen Compose, siehe Schritt 4 unter
"Erstinstallation"). Kein gemeinsames Netz für beide Instanzen mehr, und am zentralen Caddy
selbst kein globales `trusted_proxies` — das steckt schon in `apps/web/Caddyfile` je Instanz,
mit dem Edge-Subnetz der jeweiligen Instanz als Wert.

HSTS gehört an den zentralen Caddy, nicht ins Web-Image: `header >Strict-Transport-Security "..."`
(das `>` ergänzt statt zu ersetzen). Setzt eine andere Config-Datei des zentralen Caddy den Header
schon global, hier keinen zweiten `header`-Block dafür anlegen, sonst kommt der Header doppelt an.
`apps/web/Caddyfile` setzt denselben Header ohne `preload` als Rückfalloption (Befund INFO) —
`preload` ohne vorherige Eintragung bei hstspreload.org bringt nichts außer einem falschen
Versprechen im Header, das gilt am zentralen Caddy genauso.

CAA-Eintrag für beide Domains bei der DNS-Zone nicht vergessen (`CAA 0 issue "letsencrypt.org"`
oder wer sonst ausstellt), sonst kann jede beliebige CA für die Domain ein Zertifikat ausstellen.

Der `write`-Timeout in `apps/web/Caddyfile` steht auf 30s (CSV-Exporte, Monatsabschlüsse).
Setzt der zentrale Caddy selbst einen `write`-Timeout für seinen `reverse_proxy`, muss der
mindestens genauso lang sein, sonst kappt er lange Exporte, bevor das Web-Image es tut.

Komprimieren muss der zentrale Caddy nicht, das erledigt das Web-Image selbst (zstd/gzip, alles
außer `/api/*`). Für diese Domains also kein `encode` eintragen: `/api/*` bleibt absichtlich
unkomprimiert, weil dort CSRF-Token und Recovery-Codes in den Antworten stehen (BREACH).

Domains zeigen aktuell direkt auf den Server, ohne Cloudflare oder einen anderen vorgeschalteten
Anbieter (Entscheidung Leon, 2026-09-25). Schutz gegen einen volumetrischen Angriff (Bandbreite
ausschöpfen, bevor eine einzelne Verbindung überhaupt zählt) gibt es damit serverseitig nicht,
das Restrisiko ist bewusst akzeptiert. Was der Server selbst gegen Missbrauch einzelner
Verbindungen und wiederholte Angreifer aus einer Quelle tun kann, steht im nächsten Abschnitt.

## Serverseitiger Schutz ohne Cloudflare

Ergänzt Befund M5. Wirkt gegen einzelne aggressive Quellen, nicht gegen verteilte volumetrische
Angriffe (siehe Absatz oben).

- **Access-Log:** `apps/web/Caddyfile` schreibt strukturierte JSON-Logs nach
  `/var/log/caddy/zeit-access.log` in ein benanntes Volume (`zeit-<instanz>-access-log`), Rotation
  über `roll_size`/`roll_keep_for` (max. 20 MiB je Datei, 7 Tage Aufbewahrung). Pfad auf dem Host
  ermitteln mit `docker volume inspect zeit-live-access-log --format '{{ .Mountpoint }}'`.
- **fail2ban:** Beispiel-Filter und -Jail liegen in `deploy/host/fail2ban-filter-zeit.conf` und
  `deploy/host/fail2ban-jail-zeit.local`. Nach `/etc/fail2ban/filter.d/zeit.conf` bzw.
  `/etc/fail2ban/jail.d/zeit.local` kopieren, `logpath` auf die echten Mountpoints beider
  Instanzen setzen, `ignoreip` behält das VPN-Netz 10.8.0.0/24, damit eigene Anmeldeversuche
  über das VPN nie gesperrt werden. Die Jail bannt über die Chain `DOCKER-USER`, nicht über
  `INPUT` — Docker hängt sein eigenes Port-Forwarding vor die normalen iptables-Regeln, `INPUT`
  würde dort nie greifen.
- **Verbindungslimits:** `deploy/host/docker-user-limits.service` trägt `connlimit`- und
  `hashlimit`-Regeln in `DOCKER-USER` ein (Verbindungen je Quelladresse begrenzen, Rate neuer
  Verbindungen begrenzen). `<WAN_IF>` durch das echte Interface ersetzen (`ip route show
  default` zeigt es an), danach `systemctl enable --now docker-user-limits.service`. Läuft nach
  `docker.service`, weil `DOCKER-USER` erst existiert, sobald Docker gestartet ist.
- **SYN-Cookies:** `net.ipv4.tcp_syncookies` sollte auf den meisten Distributionen schon `1`
  sein, vor dem Livegang trotzdem mit `sysctl net.ipv4.tcp_syncookies` prüfen und nötigenfalls
  über `/etc/sysctl.d/` dauerhaft setzen.

## Schlüssel erzeugen

Jedes Secret in `.env` einzeln erzeugen, nie wiederverwenden. Die Datenbank-Passwörter als hex,
weil sie unkodiert in `DATABASE_URL` stehen und ein `/` aus base64 die URL zerbricht:

```
openssl rand -hex 32      # POSTGRES_PASSWORD, ZEIT_OWNER_PASSWORD, ZEIT_APP_PASSWORD, ZEIT_BACKUP_PASSWORD
openssl rand -base64 32   # PASSWORD_PEPPER, DATA_ENCRYPTION_KEY (genau 32 Byte)
age-keygen -o backup-key.txt   # Backup-Verschlüsselung, siehe Abschnitt "Backup"
```

`PASSWORD_PEPPER`, `DATA_ENCRYPTION_KEY`, die Datenbank-Passwörter und die age-Identität aus
`backup-key.txt` gehören einzeln in den Passwortmanager, nicht alle in denselben Eintrag —
wer einen davon braucht (z. B. für einen Restore), soll nicht automatisch auch die anderen sehen.

## Backup

Nur `live` wird gesichert. `deploy/live/backup.sh` ruft den Compose-Dienst `zeit-live-backup`
(Profil `backup`, läuft nicht dauerhaft mit) auf, der per `pg_dump` einen komprimierten Dump
erzeugt, verschlüsselt ihn mit `age` an den öffentlichen Empfänger aus `BACKUP_AGE_RECIPIENT`
und schreibt ihn nach `BACKUP_DIR`. Ein unverschlüsselter Dump verlässt den Server nie, `age`
läuft dazwischen. Ist `BACKUP_AGE_RECIPIENT` oder `BACKUP_REMOTE` nicht gesetzt, bricht das
Skript ab, statt einen unverschlüsselten Dump zu schreiben oder die Außer-Haus-Kopie stillschweigend
auszulassen.

Direkt danach kopiert `rclone` den verschlüsselten Dump nach `BACKUP_REMOTE` (Name eines Remotes
aus der `rclone.conf` des Servers, z. B. ein S3-kompatibler Bucket wie Cloudflare R2). Die
Remote-Zugangsdaten stehen ausschließlich in dieser `rclone.conf` auf dem Server, nie in diesem
Repo und nie in `.env`. Am Ziel-Bucket Versionierung oder Object Lock aktivieren — sonst kann
dieselbe Kompromittierung, die die Backups verschlüsselt, sie am Ziel auch überschreiben oder
löschen; das Skript selbst erzwingt das nicht.

Lokal bleiben die Dumps `BACKUP_KEEP_DAYS` (Default 14) Tage liegen, danach löscht das Skript sie.
Vor jedem Live-Deploy und zusätzlich über Cron laufen lassen.

Restore:

1. `age -d -i backup-key.txt zeit-live-<datum>.dump.age > zeit-live-<datum>.dump` — die Identität
   kommt aus dem Passwortmanager, nie aus dem Server selbst (der hat sie nicht).
2. `zeit-live-web` und `zeit-live-api` stoppen, `zeit-live-db` allein hochfahren.
3. `pg_restore` im laufenden `zeit-live-db`-Container als `postgres` ausführen, `--clean
   --if-exists --single-transaction`.
4. Restliche Dienste wieder hochfahren.

Der Dump läuft als eigene Rolle `zeit_backup` (nur lesend, `BYPASSRLS`), nicht als `zeit_owner`
(Bedrohungsmodell, Befund B11: wer den Backup-Container übernimmt, soll keine Trigger abschalten
oder Daten ändern können). Restore läuft als `postgres` im DB-Container, als `zeit_owner` bricht
`pg_restore` beim Übergeben der Funktionen an `zeit_system` ab.

Ein Restore-Test läuft monatlich gegen eine Wegwerf-Datenbank, nie gegen `zeit-live-db`
direkt.

## Rollback

- **Anwendung:** vorheriges Image-Tag in `IMAGE_TAG` eintragen, dann
  `docker compose -f deploy/<instanz>/compose.yml up -d --no-build --no-deps zeit-<instanz>-api`
  (bzw. `zeit-<instanz>-web`). Das alte Image muss dafür noch lokal vorhanden sein (`docker
  image ls`), sonst vorher erneut per `docker save`/`docker load` übertragen. Kein Migrationslauf
  nötig, solange sich das Schema nicht geändert hat.
- **Datenbank:** nur zurückrollen, wenn die Migration das vorsieht (`dbmate rollback`).
  Riskant, sobald die neue Anwendung bereits Daten im neuen Schema geschrieben hat — dann
  zuerst prüfen, ob die alte Anwendungsversion mit dem aktuellen Schema noch läuft, bevor die
  Migration zurückgenommen wird. Im Zweifel Restore aus dem letzten Backup statt Rollback.
