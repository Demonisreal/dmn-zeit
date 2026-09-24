# Sicherheit

Stand der Checkliste aus `G:\dmn\SICHERHEIT-CHECKLISTE.md` für dmn-zeit. Abgehakt ist nur, was
umgesetzt und belegt ist; dahinter steht der Nachweis. Zuletzt geprüft: 24.09.2026, Branch `aufbau`.

## Anmeldung

- [x] argon2id (m = 19 MiB, t = 2, p = 1) – `apps/api/src/auth/passwords.ts`, `passwords.spec.ts`
- [ ] Rehash ohne Abmeldung anderer Geräte (läuft derzeit über `password_change`, eigene Funktion in Arbeit)
- [x] Pepper aus der Umgebung, im Live-Modus Pflicht – `apps/api/src/config.ts`, `config.spec.ts`
- [x] Passwortregeln 12–128 Zeichen, Liste häufiger Passwörter – `passwords.spec.ts`, `test/auth/tokens.int.spec.ts`
- [x] Generische Fehlermeldung, Dummy-Hash – `test/auth/login.int.spec.ts`
- [x] Backoff nach 5 Fehlversuchen (1 bis 64 min), Zähler verfällt nach 24 h – `test/db/auth.int.spec.ts`, `test/auth/login.int.spec.ts`
- [ ] Zweiter Faktor Pflicht im Live-Modus (Passkey oder Passwort + TOTP) – DB fertig (`20260924000600_second_factor.sql`), API und Oberfläche in Arbeit
- [ ] TOTP verschlüsselt (AES-256-GCM), Replay-Schutz – DB-Seite getestet (`test/db/second-factor.int.spec.ts`), API in Arbeit
- [ ] Wiederherstellungscodes nur als Hash, einmalig – DB-Seite getestet, API in Arbeit
- [ ] Step-up vor heiklen Aktionen – in Arbeit
- [x] Kein offenes Registrieren, nur Einladung – es gibt keinen Registrierungs-Endpunkt

## Passwort vergessen und Einladungen

- [x] 32-Byte-Token, nur SHA-256 in der DB – `apps/api/src/auth/tokens.ts`, `tokens.spec.ts`
- [x] Reset-Link 30 min, Einladung 7 Tage (in der DB festgelegt, nicht vom Aufrufer) – `db/migrations/20260924000500_auth_hardening.sql`, `test/db/auth.int.spec.ts`
- [x] Einmalig, neuer Link entwertet den alten – `test/db/sessions.int.spec.ts`, `test/auth/tokens.int.spec.ts`
- [x] Gleiche Antwort für bekannte und unbekannte Adressen, Mail nach der Antwort – `test/auth/tokens.int.spec.ts`
- [x] Rate-Limit 3/h je Adresse, 10/h je IP – `test/auth/tokens.int.spec.ts`
- [x] Reset beendet alle Sitzungen, Info-Mail – `test/auth/tokens.int.spec.ts`
- [x] Token im URL-Fragment (`/reset#t=`, `/invite#t=`) – `apps/api/src/auth/auth.service.ts`, `apps/web/src/app/auth/use-fragment-token.ts`

## Sitzungen und CSRF

- [x] `HttpOnly`, `Secure`, `SameSite=Strict`, `__Host-` bei https – `test/auth/http.int.spec.ts`
- [x] Token nur als Hash, serverseitig widerrufbar – `test/db/sessions.int.spec.ts`
- [x] 12 h Leerlauf, 7 Tage absolut – `db/migrations/20260923000000_core.sql`, `test/db/sessions.int.spec.ts`
- [x] Neue Sitzung nach Login und Passwortwechsel – `test/auth/sessions.int.spec.ts`
- [ ] Neue Sitzung nach Rechtewechsel – kommt mit der Nutzerverwaltung
- [x] Liste eigener Sitzungen mit Beenden – `test/auth/sessions.int.spec.ts`
- [x] CSRF: Token, `Sec-Fetch-Site`/Origin, nur JSON – `test/auth/csrf.int.spec.ts`

## XSS und Ausgabe

- [x] Keine HTML-Strings ins DOM, kein `eval` (ESLint bricht ab) – `eslint.config.mjs`
- n/a DOMPurify – die Oberfläche zeigt kein Nutzer-HTML und kein Markdown
- n/a Links aus Nutzerdaten – es gibt keine
- [ ] QR-Code-SVG nur als `<img>` – kommt mit der TOTP-Einrichtung
- [ ] Strenge CSP für die Oberfläche (Caddy im Web-Image) – API hat bereits `default-src 'none'` (`test/auth/http.int.spec.ts`)
- [x] Build ohne Inline-Skripte und -Styles – geprüft in Stufe 4 (`dist/index.html`)
- [ ] Mails als Text, Betreff ohne ungeprüfte Eingaben – Texte sind Klartext; der Mandantenname im Einladungsbetreff läuft noch nicht durch die Freitext-Bereinigung

## Eingaben und Bereinigung

- [x] Serverseitige Prüfung mit zod auf jedem Endpunkt – `apps/api/src/common/zod.pipe.ts`, Verträge in `packages/shared`
- [ ] Freitext bereinigt (trim, NFC, keine Steuerzeichen, Längenlimit) – in Arbeit
- [x] SQL nur parametrisiert, `sql.raw` verboten – `eslint.config.mjs`, Kysely
- [x] Body-Limit 100 kB, nur JSON bei schreibenden Requests – `test/auth/http.int.spec.ts`, `csrf.int.spec.ts`
- [ ] CSV-Formel-Injection – kommt mit den Exporten
- n/a Pfade und URLs aus Eingaben – es gibt keine Datei- oder URL-Parameter
- [x] Höchstspanne für Zeiträume (62 bzw. 366 Tage) – `packages/shared/src/common.ts`

## Rate-Limiting und Missbrauch

- [x] Global 300/min je IP und Route – `apps/api/src/common/throttle.ts`
- [x] Login 10/min, Reset je Adresse und IP – `test/auth/login.int.spec.ts`, `tokens.int.spec.ts`
- [ ] Limits auf zweiten Faktor, Passkey und Step-up – in Arbeit (MFA-Challenge erlaubt höchstens 5 Versuche, DB-seitig getestet)
- [x] 429 mit `Retry-After` – `test/auth/login.int.spec.ts`
- [x] `trust proxy` nur CIDR, `/0` abgelehnt – `config.spec.ts`
- [ ] Mengengrenzen und Demo-Limits – Paging in den Verträgen, Demo folgt

## Autorisierung und Mandanten

- [ ] Rollenprüfung auf jedem Endpunkt – Guards stehen (`roles.guard.ts`), Fachmodule folgen
- [ ] Ressourcenprüfung gegen IDOR – Helfer `scope.ts` steht, Fachmodule folgen
- [x] Mandantentrennung per RLS, fail closed – `test/db/rls.int.spec.ts`
- [x] Niemand entscheidet eigene Anträge, niemand ändert die eigene Rolle – `test/db/requests.int.spec.ts`, `access.int.spec.ts`
- [ ] Rollen-Matrix als Test – folgt mit den Fachmodulen

## HTTP-Header und Transport

- [ ] TLS und HSTS – kommt mit dem Deploy (Caddy)
- [x] API: nosniff, `frame-ancestors 'none'`, `X-Frame-Options: DENY` – `test/auth/http.int.spec.ts`
- [ ] Oberfläche: dieselben Header plus `Referrer-Policy`, `Permissions-Policy`, COOP/CORP – Web-Caddyfile folgt
- [x] Kein CORS (Oberfläche und API unter einer Origin)
- [ ] Header-Scan auf dem Live-System

## Verschlüsselung und Geheimnisse

- [x] Keine Geheimnisse im Repo, `.env` gitignored
- [ ] Server-`.env` mit Rechten 600 – beim Deploy
- [ ] AES-256-GCM für TOTP-Geheimnisse – in Arbeit
- [ ] Verschlüsselte Backups – beim Deploy
- [ ] gitleaks in CI, Secret Scanning auf GitHub – beim Veröffentlichen

## Fehler, Logs und Protokoll

- [x] Keine Interna an den Client, Fehlerform `{ code, message, details }` – `exception.filter.spec.ts`, `body-errors.spec.ts`
- [x] Redaction von Cookies, CSRF-Header, Passwörtern, Tokens – `apps/api/src/common/logging.ts`
- [ ] Alle Sicherheitsereignisse im Protokoll – Login und Einladung ja, zweiter Faktor folgt
- [x] Protokoll append-only – `test/db/journals.int.spec.ts`
- [ ] Log-Rotation auf dem Server – beim Deploy

## Datenbank

- [x] Laufzeitrolle `zeit_app` ohne Owner-/Superuser-Rechte, explizite Grants – `db/init/00-roles.sh`, `test/db/rls.int.spec.ts`
- [x] Anmeldetabellen für die App gesperrt, Zugriff nur über Definer-Funktionen – `test/db/auth.int.spec.ts`
- [x] Statement-Timeout 15 s, Leerlauf in Transaktion 30 s – `db/init/00-roles.sh`
- [ ] Migrationen in CI anwenden und zurückrollen – CI-Job folgt
- [ ] Backups mit Restore-Test – beim Deploy

## Abhängigkeiten, CI und Container

- [ ] Audit, Dependabot, CodeQL, Trivy
- [x] Actions per SHA gepinnt, `permissions: contents: read` – `.github/workflows/ci.yml`
- [ ] Container gehärtet (Nicht-root, read_only, cap_drop, no-new-privileges, Limits)
- [ ] Interne Netze, keine offenen Ports
- [ ] Branch-Schutz auf `main`

## Datenschutz

- [ ] Löschfristen umgesetzt
- [ ] Auskunft: eigene Protokolleinträge sichtbar – RLS erlaubt es (`test/db/rls.int.spec.ts`), Oberfläche folgt
- [ ] Impressum und Datenschutzerklärung verlinkt
- [x] Krankmeldungen: Kolleginnen und Kollegen sehen nur "abwesend" – `app.team_absence_days`, `test/db/access.int.spec.ts`

## Demo-Instanz

- [ ] Sandbox je Besucher, Aufräumen – DB-Funktion `ops.purge_expired_sandboxes` getestet, API folgt
- [ ] Anlage-Limits, Obergrenze
- [ ] Kein Mailversand (Postausgang), kein Internet aus der Demo-API
- [ ] `noindex`, Banner "Beispieldaten"

## Prüfung vor Release

- [ ] security-auditor, penetration-tester, security-engineer, code-reviewer ohne offenen Befund
- [ ] Live-System gegen diese Liste geprüft
