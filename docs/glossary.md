# Glossar Deutsch → Englisch

Feste Übersetzungen für die Oberfläche. Beide Sprachen sind inhaltlich gleich, ein Begriff hat im
Englischen genau eine Übersetzung. Neue Fachbegriffe kommen zuerst hierher, dann in die
JSON-Dateien unter `apps/web/src/i18n/locales/`.

Gesetze und Paragrafen bleiben im Englischen deutsch: `§ 4 ArbZG`, `§ 7 BUrlG`. Beim ersten
Auftreten auf einer Seite darf der englische Name in Klammern stehen (Working Hours Act, Federal
Leave Act).

## Zeiterfassung

| Deutsch              | Englisch             | Hinweis                                                                  |
| -------------------- | -------------------- | ------------------------------------------------------------------------ |
| Stempeln             | clock in / clock out | Verb je nach Richtung, Knopf: "Clock in"                                 |
| Kommen               | clock in             | Spaltenkopf im Wochenbuch: "In"                                          |
| Gehen                | clock out            | Spaltenkopf im Wochenbuch: "Out"                                         |
| Gehen aus der Pause  | clock out            | kein eigener Knopf: "Gehen" in der Pause beendet den Tag am Pausenbeginn |
| Pause                | break                | Knopf: "Start break", zurück mit "Weiter" / "Resume"                     |
| Buchung              | time entry           | nie "booking"                                                            |
| Woche                | week                 | Navigation und Startseite                                                |
| Kalenderwoche (KW)   | week (Wk)            | "Wk 39", nicht "CW"                                                      |
| Ist                  | worked               | Spaltenkopf                                                              |
| Soll, Sollzeit       | target, target time  |                                                                          |
| Differenz            | difference           |                                                                          |
| Arbeitstag           | workday              |                                                                          |
| Nachtrag             | missed entry         | Antrag auf eine fehlende Buchung                                         |
| Korrektur            | correction           |                                                                          |
| Korrekturantrag      | correction request   |                                                                          |
| Arbeitszeitmodell    | working time model   |                                                                          |
| Teilzeit             | part-time            |                                                                          |
| Vertrag              | contract             |                                                                          |
| gültig ab            | valid from           |                                                                          |
| Monatsabschluss      | month-end close      |                                                                          |
| abschließen / öffnen | close / reopen       | für Monate                                                               |
| gesperrt             | locked               | Buchungen nach dem Abschluss                                             |
| Änderungsprotokoll   | audit log            |                                                                          |
| Stundenzettel        | timesheet            |                                                                          |
| Monatsübersicht      | monthly overview     |                                                                          |

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
| Betrieb, Mandant      | company                   | "tenant" nur im Code, nie für Kunden       |
| Musterbetrieb         | sample company            | Demo, immer als erfunden gekennzeichnet    |
| Anmelden / Abmelden   | sign in / sign out        | nie "log in"                               |
| Sitzung               | session                   |                                            |
| Einladung             | invitation                |                                            |
| Passwort festlegen    | set password              |                                            |
| Passwort zurücksetzen | reset password            |                                            |

## Projekte

| Deutsch                   | Englisch             | Hinweis                                                       |
| ------------------------- | -------------------- | ------------------------------------------------------------- |
| Kunde                     | client               | Auftraggeber, nie "Mandant" (auch im Steuerbüro nicht)        |
| Kundennummer              | client number        |                                                               |
| Projekt                   | project              |                                                               |
| Aufgabe                   | task                 | Unterteilung eines Projekts                                   |
| Projektzeit               | project time         | getrennt von den Buchungen der Stempeluhr                     |
| Nachtrag (Projektzeit)    | manual entry         | ohne Antrag, mit Pflichtnotiz; nicht "missed entry"           |
| Timer, Projekt-Timer      | timer, project timer | ergänzt die Stempeluhr; Knöpfe "Start"/"Stop", nie "clock in" |
| läuft                     | running              | laufender Timer                                               |
| abrechenbar               | billable             |                                                               |
| Stundensatz, Satz         | hourly rate, rate    |                                                               |
| Standardsatz              | default rate         | gilt, wenn kein speziellerer Satz passt                       |
| Rundung                   | rounding             | je Projekt, Aufgabe und Tag, nie je Eintrag                   |
| Rundungsraster            | rounding increment   | "15 min"                                                      |
| aufrunden                 | round up             |                                                               |
| kaufmännisch runden       | round to nearest     |                                                               |
| abrunden                  | round down           |                                                               |
| Budget                    | budget               | Stunden je Projekt, Warnung ab 80 %                           |
| Budget überschritten      | over budget          |                                                               |
| Abgleich                  | reconciliation       | Arbeitszeit gegen Projektzeit, nur Hinweis, kein Befund       |
| ohne Projekt              | unassigned           | Arbeitszeit ohne Projektzeit                                  |
| außerhalb der Arbeitszeit | outside working time | Projektzeit ohne gestempelte Zeit                             |
| Kürzel (Projekt)          | code                 | freiwillig, eindeutig je Mandant                              |
| Rundungsart               | rounding mode        | aufrunden, kaufmännisch runden oder abrunden                  |
| für alle buchbar          | open to everyone     | sonst nur Mitglieder und Personalverwaltung                   |
| Mitglied (Projekt)        | member               |                                                               |
| gesperrt (Kunde)          | locked               | Einschränkung nach Art. 18 DSGVO statt Löschen                |
| Solo-Bereich              | solo workspace       | Mandant für eine Person, nur auf Einladung                    |
| Freelancer                | freelancer           |                                                               |

## Rechnungen

Eine Rechnung erscheint in der Sprache ihres Kunden, nicht in der Sprache der angemeldeten Person.
Die Rechnungstexte stehen in `apps/api/src/invoices/texts.ts` und folgen diesem Glossar.

| Deutsch                | Englisch             | Hinweis                                                                                        |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Abrechnung             | billing              | Navigation                                                                                     |
| nicht abgerechnet      | unbilled             |                                                                                                |
| Rechnung               | invoice              |                                                                                                |
| Entwurf                | draft                | vor dem Ausstellen, ohne Nummer, änderbar                                                      |
| ausstellen             | issue                | vergibt Nummer und Datum, danach unveränderbar                                                 |
| ausgestellt            | issued               |                                                                                                |
| bezahlt                | paid                 |                                                                                                |
| überfällig             | overdue              |                                                                                                |
| stornieren             | cancel               | ausgestellte Rechnung, nur über eine Stornorechnung                                            |
| Storno                 | cancellation         |                                                                                                |
| Stornorechnung         | cancellation invoice | nie "Gutschrift" (§ 14 Abs. 2 S. 2 UStG), nie "credit note"                                    |
| storniert durch        | cancelled by         | Verweis am Original: "Storniert durch Stornorechnung X."                                       |
| Position               | line item            |                                                                                                |
| freie Position         | custom line item     | nicht aus erfassten Zeiten                                                                     |
| Befreiungsgrund        | exemption reason     | Grund der Steuerbefreiung, Pflicht bei steuerfreier Position                                   |
| Zeiten neu einlesen    | reload booked time   | Knopf im Entwurf; übernimmt neue Zeiten, leitet steuerliche Behandlung und Steuerprofil neu ab |
| Rechnungsnummer        | invoice number       |                                                                                                |
| Nummernkreis           | number sequence      | je Jahr, auch für Stornorechnungen: `RE-2026-0007`                                             |
| Präfix                 | prefix               |                                                                                                |
| Rechnungsdatum         | issue date           |                                                                                                |
| Leistungszeitraum      | service period       |                                                                                                |
| Fälligkeit             | due date             |                                                                                                |
| Zahlungsziel           | payment terms        |                                                                                                |
| Rechnungssprache       | invoice language     | je Kunde, Deutsch oder Englisch                                                                |
| Steuernummer           | tax number           |                                                                                                |
| USt-IdNr.              | VAT ID               |                                                                                                |
| Steuerprofil           | tax profile          | Regelbesteuerung oder Kleinunternehmer, im Abrechnungsprofil                                   |
| steuerliche Behandlung | tax treatment        | je Rechnung aus Steuerprofil und Kunde abgeleitet                                              |
| Regelbesteuerung       | regular taxation     |                                                                                                |
| Kleinunternehmer       | small business       | "small business (§ 19 UStG)"                                                                   |
| Reverse Charge         | reverse charge       | Rechnungshinweis zweisprachig, Wortlaut gegen UStAE prüfen                                     |
| Kleinbetragsrechnung   | small-amount invoice | bis 250 € brutto (§ 33 UStDV), nicht bei Reverse Charge                                        |
| E-Rechnung             | e-invoice            |                                                                                                |
| XRechnung, ZUGFeRD     | XRechnung, ZUGFeRD   | Formatnamen, nicht übersetzen                                                                  |
| Käuferreferenz         | buyer reference      | BT-10, bei öffentlichen Auftraggebern die Leitweg-ID                                           |
| Stundennachweis        | time report          | Projektzeiten je Kunde, nicht "timesheet"                                                      |
| Musterrechnung         | sample invoice       | Demo, keine Rechnung im Sinne des § 14 UStG                                                    |
