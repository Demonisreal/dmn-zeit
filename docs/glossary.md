# Glossar Deutsch → Englisch

Feste Übersetzungen für die Oberfläche. Beide Sprachen sind inhaltlich gleich, ein Begriff hat im
Englischen genau eine Übersetzung. Neue Fachbegriffe kommen zuerst hierher, dann in die
JSON-Dateien unter `apps/web/src/i18n/locales/`.

Gesetze und Paragrafen bleiben im Englischen deutsch: `§ 4 ArbZG`, `§ 7 BUrlG`. Beim ersten
Auftreten auf einer Seite darf der englische Name in Klammern stehen (Working Hours Act, Federal
Leave Act).

## Zeiterfassung

| Deutsch              | Englisch             | Hinweis                                  |
| -------------------- | -------------------- | ---------------------------------------- |
| Stempeln             | clock in / clock out | Verb je nach Richtung, Knopf: "Clock in" |
| Kommen               | clock in             | Spaltenkopf im Wochenbuch: "In"          |
| Gehen                | clock out            | Spaltenkopf im Wochenbuch: "Out"         |
| Pause                | break                |                                          |
| Buchung              | time entry           | nie "booking"                            |
| Woche                | week                 | Navigation und Startseite                |
| Kalenderwoche (KW)   | week (Wk)            | "Wk 39", nicht "CW"                      |
| Ist                  | worked               | Spaltenkopf                              |
| Soll, Sollzeit       | target, target time  |                                          |
| Differenz            | difference           |                                          |
| Arbeitstag           | workday              |                                          |
| Nachtrag             | missed entry         | Antrag auf eine fehlende Buchung         |
| Korrektur            | correction           |                                          |
| Korrekturantrag      | correction request   |                                          |
| Arbeitszeitmodell    | working time model   |                                          |
| Teilzeit             | part-time            |                                          |
| Vertrag              | contract             |                                          |
| gültig ab            | valid from           |                                          |
| Monatsabschluss      | month-end close      |                                          |
| abschließen / öffnen | close / reopen       | für Monate                               |
| gesperrt             | locked               | Buchungen nach dem Abschluss             |
| Änderungsprotokoll   | audit log            |                                          |
| Stundenzettel        | timesheet            |                                          |
| Monatsübersicht      | monthly overview     |                                          |

## Gleitzeit

| Deutsch               | Englisch                  | Hinweis                          |
| --------------------- | ------------------------- | -------------------------------- |
| Gleitzeit             | flextime                  |                                  |
| Gleitzeitkonto        | flextime account          |                                  |
| Saldo, Gleitzeitsaldo | balance, flextime balance |                                  |
| Anfangssaldo          | opening balance           |                                  |
| Zeitausgleich         | time off in lieu          | Abwesenheitsart, kurz nie "TOIL" |
| Kappung               | cap                       | "capped at 40:00 h"              |
| Auszahlung            | payout                    |                                  |

## Urlaub und Abwesenheit

| Deutsch               | Englisch            | Hinweis                                              |
| --------------------- | ------------------- | ---------------------------------------------------- |
| Urlaub                | leave               | Navigation "Leave", nie "vacation" in der Oberfläche |
| Urlaubsanspruch       | leave entitlement   |                                                      |
| Resturlaub            | remaining leave     |                                                      |
| Übertrag              | carry-over          |                                                      |
| Verfall               | forfeiture          | "forfeited on 31 March"                              |
| Urlaubskonto          | leave account       |                                                      |
| Abwesenheit           | absence             |                                                      |
| Krankheit             | sick leave          |                                                      |
| Attest                | medical certificate |                                                      |
| Feiertag              | public holiday      |                                                      |
| halber Tag            | half day            |                                                      |
| Antrag                | request             |                                                      |
| genehmigen / ablehnen | approve / reject    |                                                      |
| zurückziehen          | withdraw            | eigener Antrag vor der Entscheidung                  |
| stornieren            | cancel              | genehmigter Antrag                                   |
| Posteingang           | inbox               | offene Anträge bei der Teamleitung                   |
| Teamkalender          | team calendar       |                                                      |

## Arbeitsrecht

| Deutsch                    | Englisch                            | Hinweis                                         |
| -------------------------- | ----------------------------------- | ----------------------------------------------- |
| Hinweis                    | notice                              | ein ArbZG-Befund in der Zeile                   |
| Hinweis nach § 4           | § 4 break notice                    | Pause zu kurz oder mehr als 6 h am Stück        |
| Befund                     | finding                             | Fachbegriff in Personalverwaltung und Protokoll |
| quittieren                 | acknowledge                         |                                                 |
| Höchstarbeitszeit          | maximum working time                | § 3 ArbZG                                       |
| Ruhezeit                   | rest period                         | § 5 ArbZG                                       |
| Sonn- und Feiertagsarbeit  | work on Sundays and public holidays | § 9 ArbZG                                       |
| Hinweis zum Urlaubsverfall | leave forfeiture notice             | Mitwirkungsobliegenheit, BAG 2019               |
| Regelversion               | rule version                        |                                                 |
| keine Rechtsberatung       | not legal advice                    |                                                 |

## Rollen und Konto

| Deutsch               | Englisch                  | Hinweis                                    |
| --------------------- | ------------------------- | ------------------------------------------ |
| Beschäftigte          | employee                  |                                            |
| Teamleitung           | team lead                 |                                            |
| Personalverwaltung    | HR                        | Navigation "Personal" → "HR"               |
| Administration        | administration            | Navigation "Verwaltung" → "Administration" |
| Personalnummer        | personnel number          |                                            |
| Eintritt / Austritt   | start date / leaving date |                                            |
| Betrieb, Mandant      | company                   | "tenant" nur im Code                       |
| Musterbetrieb         | sample company            | Demo, immer als erfunden gekennzeichnet    |
| Anmelden / Abmelden   | sign in / sign out        | nie "log in"                               |
| Sitzung               | session                   |                                            |
| Einladung             | invitation                |                                            |
| Passwort festlegen    | set password              |                                            |
| Passwort zurücksetzen | reset password            |                                            |
