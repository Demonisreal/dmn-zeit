# Sicherheitslücken melden

## Unterstützte Versionen

Es gibt keine Releases mit eigener Pflege. Unterstützt wird nur der aktuelle Stand von `main` und
die jeweils laufende Demo- und Live-Instanz.

## Meldeweg

Vertraulich per Mail an security@dmn-software.com, dieselbe Adresse steht in
`/.well-known/security.txt`. Bitte keine öffentlichen Issues, Pull Requests oder Diskussionen zu
Sicherheitslücken.

Hilfreich sind:

- betroffene Stelle (Route, Seite, Datei oder Umgebungsvariable)
- Schritte zum Nachvollziehen und die Auswirkung
- getesteter Stand: Commit, oder Demo mit Datum und Uhrzeit

## Umfang

Gemeldet werden sollen Lücken in der ausgelieferten Anwendung: API, Oberfläche, Auslieferung über
Caddy und die Container-Konfiguration aus diesem Repository. Zum Beispiel Zugriff auf Daten eines
anderen Mandanten oder einer anderen Person, Umgehen von Anmeldung, zweitem Faktor, CSRF-Schutz
oder Rollenprüfung, eingeschleuster Code (XSS, SQL) oder Änderungen an Zeiten und Abwesenheiten
ohne Berechtigung.

Nicht dazu gehören:

- Social Engineering, Phishing, physischer Zugriff
- Denial of Service, Lasttests und das massenhafte Anlegen von Demo-Sandboxes
- ungeprüfte Scanner-Ausgaben und Befunde ohne nachvollziehbare Auswirkung
- Lücken in Abhängigkeiten, die sich hier nicht ausnutzen lassen; die gehören zum jeweiligen Projekt

## Wo getestet werden darf

Am besten gegen eine eigene Installation (Datenbank aus `compose.dev.yml`, dazu `pnpm dev`). In
der Demo nur innerhalb der eigenen Sandbox, deren Musterbetrieb ist erfunden. Die Live-Instanz enthält echte
Arbeitszeitdaten und ist kein Testziel.

## Was danach passiert

Jede Meldung wird gelesen und über denselben Weg beantwortet. Das Projekt wird von einer Person
betreut, feste Antwort- oder Behebungszeiten gibt es deshalb nicht. Bitte mit einer
Veröffentlichung warten, bis die Lücke behoben ist. Bestätigte Lücken werden in `main` behoben
und danach beschrieben; wer sie gemeldet hat, wird auf Wunsch genannt.
