# Fachlogik @zeit/rules

Stand 24.09.2026. Beschreibt, was `packages/rules` rechnet, auf welcher Rechtsgrundlage und wo
die Grenzen von Stufe 1 liegen. Die Software gibt Hinweise, keine Rechtsberatung (siehe
PRODUCT.md). Alle Paragrafen wurden gegen gesetze-im-internet.de geprüft (Rechercheergebnis vom
24.09.2026), Feiertage gegen die unten genannten Quellen.

## calendar/

| Funktion           | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workdayOf`        | Arbeitstag einer Buchung = lokales Datum ihres Beginns (Datenmodell, planung.md Abschnitt "Datenmodell").                                                                                                                                                                                                                                                                                                                            |
| `splitByLocalDate` | Zerlegt eine Zeitspanne in Tagesabschnitte je lokalem Kalendertag, auch am 23-Stunden-Tag (29.03.2026) und am 25-Stunden-Tag (25.10.2026).                                                                                                                                                                                                                                                                                           |
| `monthDays`        | Alle Kalendertage eines Monats.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `wholeMinutes`     | Ganze Minuten einer Summe von Zeitspannen: exakt addiert, dann gerundet, weil die Stempel Sekunden tragen. Einzige Minutenquelle für `summarizeWorkday` und `checkShifts`.                                                                                                                                                                                                                                                           |
| `gapsBetween`      | Lücken zwischen aufeinanderfolgenden Zeitspannen, nach Beginn sortiert. Sich berührende oder überlappende Spannen ergeben keine Lücke. Einzige Lückenrechnung, `summarizeWorkday` und `checkShifts` nutzen sie beide.                                                                                                                                                                                                                |
| `summarizeWorkday` | `(entries, now, timeZone)` für einen Arbeitstag: `workedMinutes`, `breakMinutes`, `gaps`, `firstStart`, `lastEnd`, `running`. Eine laufende Buchung (`end: null`) wird mit `now` geschlossen. Pause ist jede Lücke zwischen zwei Buchungen, auch unter 15 min; eine Pause nach der letzten Buchung zählt erst, wenn wieder gestempelt wird. Minuten über `wholeMinutes`. Buchungen verschiedener Arbeitstage führen zu einem Fehler. |

Grenzen:

- Rein kalendarisch, keine Sonderfälle für Schaltsekunden oder historische Zeitzonenwechsel vor 1970.
- Die Wochentabelle rechnet je Arbeitstag nach dem Datenmodell, die ArbZG-Prüfung je Schicht:
  Eine Nachtschicht mit Pause nach Mitternacht steht in der Tabelle auf zwei Tagen, geprüft wird
  sie als eine Schicht am Tag ihres Beginns.

## holidays/

Osterberechnung nach Meeus/Jones/Butcher (gregorianischer Kalender). Feiertage je Bundesland mit
Gültigkeitsjahren:

| Feiertag                       | Länder                                                                                              | Quelle                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heilige Drei Könige            | BW, BY, ST                                                                                          | https://www.feiertage-deutschland.de/heilige-drei-koenige/                                                                                           |
| Frauentag (8.3.)               | BE ab 2019, MV ab 2023                                                                              | https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2024/240306_frauentag_feiertag_frei.html                     |
| Ostersonntag, Pfingstsonntag   | nur BB                                                                                              | https://bravors.brandenburg.de/gesetze/ftg_2003/6                                                                                                    |
| Tag der Befreiung (8.5.)       | BE, einmalig 2020 und 2025                                                                          | https://www.feiertage-deutschland.de/tag-der-befreiung/                                                                                              |
| Fronleichnam                   | BW, BY, HE, NW, RP, SL landesweit; SN, TH nur mit `corpus_christi` (einzelne katholische Gemeinden) | https://www.feiertage-deutschland.de/fronleichnam/                                                                                                   |
| Mariä Himmelfahrt (15.8.)      | SL landesweit; BY nur mit `assumption_day` (Gemeinden mit überwiegend katholischer Bevölkerung)     | https://www.sonntagsblatt.de/artikel/kirche/mariae-himmelfahrt-2026-bayern-wo-am-15-august-geoeffnet-ist-und-wo-nicht                                |
| Augsburger Friedensfest (8.8.) | BY nur mit `augsburg_peace` (gilt nur in der Stadt Augsburg)                                        | https://de.wikipedia.org/wiki/Augsburger_Hohes_Friedensfest                                                                                          |
| Weltkindertag (20.9.)          | TH ab 2019                                                                                          | https://www.insuedthueringen.de/inhalt.thueringen-weltkindertag-am-20-september-wird-gesetzlicher-feiertag.965d7134-60d5-4c68-bb33-cb7a6227ff7d.html |
| Reformationstag (31.10.)       | BB/MV/SN/ST/TH immer, HB/HH/NI/SH ab 2018, bundesweit einmalig 2017                                 | https://www.luther2017.de/de/neuigkeiten/bundesweiter-trend-ein-feiertag-zum-500-reformationsjubilaeum/index.html                                    |
| Allerheiligen (1.11.)          | BW, BY, NW, RP, SL                                                                                  | https://www.feiertage-deutschland.de/allerheiligen/                                                                                                  |
| Buß- und Bettag                | nur SN, Mittwoch vor dem 23.11.                                                                     | https://home.1und1.de/magazine/wissen/psychologie/buss-bettag-feiertag-bundesland-gilt-37476140                                                      |
| Heiligabend, Silvester         | alle Länder, halber Tag (`portion: 0.5`) nur mit `options.halfDays`                                 | betriebliche Regel, kein gesetzlicher Feiertag                                                                                                       |

Grenzen:

- Die optionalen Feiertage sind Schalter je Mandant, keine Gemeindelisten. `corpus_christi` wirkt
  nur in SN und TH (in den sechs anderen Ländern ist Fronleichnam ohnehin gesetzlich),
  `assumption_day` und `augsburg_peace` nur in BY. Ob der Betrieb in einer betroffenen Gemeinde
  liegt, entscheidet der Mandant.
- Die bayerische Gemeindeliste für Mariä Himmelfahrt wird per Zensus aktualisiert (zuletzt 2025);
  hier bleibt es beim Schalter.
- Zwei Feiertage können auf denselben Tag fallen (z. B. 1.5.2008: Tag der Arbeit und Christi
  Himmelfahrt). `holidaysFor` liefert dann beide Einträge; `targetMinutes` nimmt nur einen
  `Holiday` entgegen, der Aufrufer muss den mit `portion: 1` wählen.
- Kein bundesweiter Buß- und Bettag vor 1995 abgebildet (vor Stufe 1 nicht relevant).

## contracts/

`contractOn` sucht den Vertrag mit dem größten `validFrom <= date`. `targetMinutes` liefert 0
Minuten außerhalb des Beschäftigungszeitraums, 0 Minuten an einem vollen Feiertag, die halbierten
Minuten an einem halben Feiertag (24./31.12., nur wenn der Mandant halbe Tage aktiviert hat), sonst
die Vertragsminuten des Wochentags. Der Feiertag wirkt nur über das Soll; eine Gutschrift gibt es
dafür nicht (siehe `flextime/`). Kein Bezug zu Gesetzestext, reine Vertragsauswertung.

## arbzg/ (Arbeitszeitgesetz)

| Befund                   | Paragraf   | Regel                                                                                                           | Quelle                                            |
| ------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ARBZG_3_OVER_8`         | § 3 S. 1   | werktägliche Arbeitszeit über 8 h (Hinweis)                                                                     | https://www.gesetze-im-internet.de/arbzg/__3.html |
| `ARBZG_3_OVER_10`        | § 3 S. 2   | werktägliche Arbeitszeit über 10 h (Warnung)                                                                    | https://www.gesetze-im-internet.de/arbzg/__3.html |
| `ARBZG_4_BREAK_SHORT`    | § 4 S. 1–2 | Pausensumme (nur Pausen ≥ 15 min zählen) reicht nicht: 30 min ab 6 h, 45 min ab 9 h, kumulativ                  | https://www.gesetze-im-internet.de/arbzg/__4.html |
| `ARBZG_4_CONTINUOUS_6H`  | § 4 S. 3   | mehr als 6 h ohne qualifizierende Pause am Stück                                                                | https://www.gesetze-im-internet.de/arbzg/__4.html |
| `ARBZG_5_REST_UNDER_11H` | § 5 Abs. 1 | Ruhezeit zwischen zwei Schichten unter 11 h                                                                     | https://www.gesetze-im-internet.de/arbzg/__5.html |
| `ARBZG_9_SUNDAY`         | § 9 Abs. 1 | Arbeit an einem Sonntag                                                                                         | https://www.gesetze-im-internet.de/arbzg/__9.html |
| `ARBZG_9_HOLIDAY`        | § 9 Abs. 1 | Arbeit an einem gesetzlichen Feiertag (`portion: 1`); die betrieblichen halben Tage 24./31.12. lösen nichts aus | https://www.gesetze-im-internet.de/arbzg/__9.html |

`groupShifts(entries, timeZone)` fasst Buchungen zu Schichten zusammen: Eine Lücke unter 3 Stunden
gehört zur Schicht, auch über Mitternacht; Buchungen, die am selben Tag wie die Schicht beginnen,
bleiben immer in ihr (geteilter Dienst), damit ein Tag nie zwei Schichten und doppelte Befunde
bekommt. Die Schicht zählt zum lokalen Datum ihres Beginns.

`checkShifts(shifts, { timeZone, holidays, range })` prüft § 3 und § 4 je Schicht und misst die
Ruhezeit nach § 5 zwischen zwei Schichten. Befunde gibt es nur für Schichten innerhalb von `range`
(beide Enden eingeschlossen); Schichten davor dienen nur als Vorlauf für die erste Ruhezeit, der
Aufrufer gibt also den Vortag mit. Pausen kommen aus `gapsBetween`, Minuten aus `wholeMinutes`,
beides wie in `summarizeWorkday`; für § 4 zählen nur Lücken ab 15 min. Alle `facts` sind ganze
Minuten, ein Tag mit 480 Minuten zeigt also nie `ARBZG_3_OVER_8`.

`RULESETS` versioniert die Grenzwerte über `validFrom`; eine Reform wird ein neuer Eintrag, alte
Befunde behalten ihre `ruleVersion`.

Grenzen:

- Die Ausnahmen der §§ 10–11 ArbZG (Gesundheitswesen, Gastronomie, Notdienste, Verschiebung der
  Sonntagsruhe im Schichtbetrieb) fehlen in v1. Sonntags- und Feiertagsarbeit ergibt deshalb
  immer eine Warnung.
- `ARBZG_9_SUNDAY` hängt am lokalen Startdatum der Schicht: Eine Nachtschicht Samstag 22:00 bis
  Sonntag 6:00 löst den Befund nicht aus, obwohl nach 0 Uhr Sonntagsarbeit stattfindet. Eine exakte
  Lösung müsste die Schicht mit `splitByLocalDate` auf die Kalendertage verteilen.
- Die Schwellen 6 h und 9 h für die Pausenpflicht sind im Code fest verdrahtet, nicht im Typ
  `Limits`; eine Reform, die diese Schwellen selbst ändert, bräuchte zusätzliche Felder.
- Die Grenze von 3 Stunden für das Ende einer Schicht ist eine Auslegung, kein Gesetzeswert; sie
  steht als Konstante im Code, nicht in `Limits`.
- Überlappende Buchungen werden nicht erkannt; das muss die API vor dem Aufruf validieren.
- `§ 16 Abs. 2` (Aufzeichnungspflicht) ist nur zur Kenntnis genommen, nicht Teil der Prüfung –
  das ist eine Protokollierungspflicht der API, keine Regel von `rules`.

## flextime/ (Gleitzeit)

Betriebliche Regel, kein Gesetz (planung.md, Entscheidungen). `dayBalance` = gearbeitete Minuten
plus gutgeschriebene Minuten minus Sollminuten. Gutgeschrieben wird nur für Urlaub und Krankheit,
und zwar das Soll des abwesenden Anteils. Ein Feiertag senkt stattdessen das Soll (0, am 24./31.12.
mit halben Tagen die Hälfte); ihn zusätzlich gutzuschreiben, würde ihn doppelt zählen. Ein
Zeitausgleichstag senkt den Saldo exakt um das Tagessoll. `accountBalance` summiert Tage und
Buchungen. `applyCap` wendet die vertragliche oder betriebliche Kappung an (`none`, `warn`,
`forfeit_at_close`); `kept + forfeited` ergibt in jedem Fall wieder den ursprünglichen Saldo.

## vacation/ (Bundesurlaubsgesetz)

| Funktion            | Paragraf                                        | Regel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Quelle                                                                                                                                                  |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `annualEntitlement` | § 3 Abs. 1, § 4, § 5 Abs. 1 Buchst. a–c, Abs. 2 | `(employment, year, asOf)`: Wartezeit 6 Monate (letzter Tag = Eintritt + 6 Monate − 1 Tag), erfüllt, wenn die Beschäftigung bis dahin reicht und `asOf` danach liegt. Ergebnis ist der größere Wert aus Vertragsurlaub und gesetzlichem Mindesturlaub (24 Werktage auf 6 Tage, also 4 Tage je Wochenarbeitstag, abschnittsweise je Monat). Der Vertragsurlaub gilt im Eintritts- und im Austrittsjahr in Zwölfteln, sonst voll. Der Mindesturlaub gilt voll, sobald die Wartezeit erfüllt ist und im Eintrittsjahr endet oder beim Ausscheiden nach dem 30.6. erfüllt ist, sonst in Zwölfteln. Greift der Mindesturlaub, kommt `vacation.entitlement.statutory_minimum`. Aufrundung ab einem halben Tag. Solange die Wartezeit am Stichtag läuft, kommt `vacation.entitlement.waiting_period` mit ihrem letzten Tag (`until`) | https://www.gesetze-im-internet.de/burlg/__3.html, https://www.gesetze-im-internet.de/burlg/__4.html, https://www.gesetze-im-internet.de/burlg/__5.html |
| `daysForRange`      | § 3 Abs. 1                                      | ein geplanter Arbeitstag kostet einen (halben) Urlaubstag, Feiertage und arbeitsfreie Tage kosten nichts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | –                                                                                                                                                       |
| `allocate`          | betrieblich, § 7 Abs. 3                         | `(days, buckets)` mit `days` = Ausgabe von `daysForRange`: jeder Tag wird aus dem Topf mit der frühesten Frist bezahlt, der an diesem Datum gilt (ab 1.1. seines Jahres bis einschließlich Frist). Tage in Datumsreihenfolge, ein Tag kann sich auf zwei Töpfe verteilen. Ergebnis je Datum und Topf plus Fehlbetrag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | –                                                                                                                                                       |
| `expiryDecision`    | § 7 Abs. 3, BAG 19.02.2019 – 9 AZR 541/15       | Übertragungsfrist 31.3., Verfall nur nach dokumentiertem, konkretem Hinweis des Arbeitgebers; die Frist selbst bleibt bis einschließlich ihres letzten Tages nutzbar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | https://www.gesetze-im-internet.de/burlg/__7.html, https://www.bundesarbeitsgericht.de/entscheidung/9-azr-541-15/                                       |
| `sickRefund`        | § 9                                             | ärztlich nachgewiesene Krankheitstage im Urlaub werden zurückgebucht                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | https://www.gesetze-im-internet.de/burlg/__9.html                                                                                                       |

Ergänzend bestätigt, aber in v1 nicht als eigene Regel abgebildet: BAG 20.12.2022 – 9 AZR 266/20
(die dreijährige Verjährung nach § 199 Abs. 1 BGB beginnt erst mit dem Jahr der ordnungsgemäßen
Mitwirkung des Arbeitgebers) – relevant für den Monatsabschluss- und Exportbereich, nicht für
`rules` selbst.

Grenzen:

- **Arbeitstage je Woche** für den Mindesturlaub kommen aus den Vertragsminuten (Wochentage mit
  mehr als 0 Minuten), nicht aus `vacationBasisDays`, weil auch `daysForRange` je geplantem
  Arbeitstag abrechnet.
- **Entschieden, Ein- und Austrittsjahr:** Der vertragliche Mehrurlaub über dem Mindesturlaub wird
  in beiden Jahren gezwölftelt wie in der üblichen Zwölftelungsklausel, der Mindesturlaub folgt
  §§ 4, 5 BUrlG, sodass ein Austritt im Dezember nicht mehr bringt als Bleiben; ein Vertrag ohne
  Zwölftelungsklausel müsste den Mehrurlaub wie den Mindesturlaub behandeln.
- **`allocate` und das Folgejahr:** Ein Tag im Dezember wird nie aus dem Topf des nächsten Jahres
  bezahlt, auch wenn der schon angelegt ist; reicht der alte Topf nicht, bleibt ein Fehlbetrag.
- **§ 5 Abs. 1, "voller Monat":** Die Umsetzung zählt einen Kalendermonat als voll, sobald ein
  einziger Beschäftigungstag hineinfällt. Der Gesetzestext meint einen vollen Monat ab dem
  Eintrittsdatum. Bei einem Eintritt mitten im Monat gibt die Vereinfachung etwas mehr, als das
  Gesetz verlangt (Mindeststandard wird nicht unterschritten).
- **Rundung nach § 5 Abs. 2** wird auch auf den vollen Jahresanspruch angewendet, nicht nur auf
  Teilurlaub – der Wortlaut beschränkt die Rundung nicht auf Teilurlaub, das ist beabsichtigt.
- **`expiryDecision` prüft nicht, ob der Hinweis rechtzeitig war.** Nach der BAG-Rechtsprechung
  muss der Hinweis so früh kommen, dass der Urlaub noch genommen werden kann; ein Hinweis kurz vor
  der Frist führt hier trotzdem zum Verfall. Eine Prüfung bräuchte eine Zeitzone (Vergleich von
  `Instant` und `PlainDate`) und gehört eher in die API.
- **Verfall bei Langzeiterkrankung** (15-Monats-Frist ab Ende des Urlaubsjahres) ist nicht in v1
  (siehe PRODUCT.md, "Nicht in v1").
- `daysForRange` prüft die Beschäftigung, dann den vollen Feiertag, dann den arbeitsfreien Tag,
  dann den halben Feiertag, dann den Arbeitstag – ein halber Feiertag auf einem arbeitsfreien Tag
  (z. B. 24.12. an einem Samstag) kostet nichts.

## billing/ (Projektabrechnung und Rechnungen)

Grundlage sind docs/rechnungen-recht.md (Rechercheergebnis vom 24.09.2026) und
docs/planung-projekte.md Abschnitt 3. Geld ist überall `bigint` in ganzen Cent, nie `number` mit
Nachkommastellen (docs/bedrohungsmodell-rechnungen.md, T-06). Gerundet wird nur in `money/`:
`roundDiv(num, den)` teilt ganzzahlig und rundet kaufmännisch halb vom Nullpunkt weg, damit eine
Stornorechnung spiegelbildlich rundet; `percentOf(cents, basisPoints)` nimmt einen Steuersatz in
Basispunkten wie `tax_rate_bp`; `parseCents` liest `"95"`, `"95.00"` oder `"-12.5"` und wirft bei
mehr als zwei Nachkommastellen.

| Funktion                                           | Paragraf                                                    | Regel                                                                                                                                                                                                                                                                                                                                                                                                                  | Quelle                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `roundMinutes`                                     | betrieblich                                                 | `(rawMinutes, { increment, mode })` rundet eine Zelle auf das Raster: `up`, `nearest` (ab dem halben Raster auf), `down`. Gerundet wird nie die einzelne Buchung, sonst würden zehn Buchungen zu je einer Minute 150 statt 15 Minuten (T-06).                                                                                                                                                                          | –                                                                                                               |
| `roundingFor`                                      | betrieblich                                                 | `(profile, client, project)`: Projekt überschreibt Kunde überschreibt Mandant, für Raster und Modus getrennt. Die Herleitung nennt für beide die Herkunft (`incrementFrom`, `modeFrom`).                                                                                                                                                                                                                               | –                                                                                                               |
| `resolveRate`                                      | betrieblich                                                 | Aufgabe+Person > Aufgabe > Projekt+Person > Projekt > Kunde+Person > Kunde > Person > Standardsatz, je Stufe der Satz mit dem jüngsten `validFrom <= Leistungstag`. Eine speziellere Stufe gewinnt auch mit einem älteren Satz. Kunde vor Person, weil die Vereinbarung mit dem Kunden bindet. `null`, wenn keine Stufe passt (Blocker beim Ausstellen); 0 Cent ist ein gültiger Satz.                                 | –                                                                                                               |
| `isBillable`                                       | betrieblich                                                 | Eintrag > Aufgabe > Projekt, der erste Wert ungleich `null` gewinnt.                                                                                                                                                                                                                                                                                                                                                   | –                                                                                                               |
| `aggregate`                                        | betrieblich                                                 | `(entries, { rates, rounding })`: eine Zelle je Person, Projekt, Aufgabe, Arbeitstag und Abrechenbarkeit. Rohminuten über `wholeMinutes` (Summe der Zeitspannen, einmal gerundet), gerundete Minuten über `roundMinutes`, Satz über `resolveRate` zum Arbeitstag. Einzige Quelle für Matrix und Rechnungsentwurf.                                                                                                      | –                                                                                                               |
| `linesFromCells`                                   | § 14 Abs. 4 UStG, § 31 Abs. 4 UStDV                         | `(cells, taxCategory)`: eine Zeitposition je Projekt, Aufgabe, Satz und Steuersatz, nur aus abrechenbaren Zellen mit Satz. Leistungszeitraum `serviceFrom`/`serviceTo` aus den Tagen der Zellen; wechselt der Satz oder der Steuersatz (1.7.2020), entstehen getrennte Positionen. `netCents = roundDiv(Σ gerundete Minuten × Satz, 60)`, also eine Rundung je Position.                                               | https://www.gesetze-im-internet.de/ustg_1980/__14.html                                                          |
| `VAT_RATES`, `vatRateFor`                          | § 12 Abs. 1–2 UStG                                          | versioniert über `validFrom` wie `RULESETS`: 19 %/7 % ab 1.1.2007, 16 %/5 % vom 1.7. bis 31.12.2020, danach wieder 19 %/7 %. Nur `standard` und `reduced` haben einen Satz, alle anderen Kategorien 0.                                                                                                                                                                                                                 | https://www.gesetze-im-internet.de/ustg_1980/__12.html                                                          |
| `taxTreatment`                                     | § 13b, § 19 UStG                                            | Kleinunternehmer → `small_business`; Unternehmen im übrigen EU-Gebiet mit USt-IdNr. → `reverse_charge`; Unternehmen im Drittland → `outside_scope`; sonst `standard`, auch für Verbraucher im Ausland und EU-Unternehmen ohne USt-IdNr. `reduced` und `exempt` wählt die einzelne freie Position.                                                                                                                      | https://www.gesetze-im-internet.de/ustg_1980/__13b.html, https://www.gesetze-im-internet.de/ustg_1980/__19.html |
| `invoiceTotals`                                    | § 14 Abs. 4 UStG, EN 16931 BR-CO-17                         | Steuer je Gruppe (Kategorie und Satz) aus der Summe der Nettobeträge der Gruppe über `percentOf`, nicht als Summe von Steuern je Position; brutto = Σ netto + Σ Steuer. Jede Gruppe und die Endsumme tragen ihre Herleitung, Beträge darin als String. Umsetzung von rechnungen-recht.md Abschnitt 5.                                                                                                                  | https://www.gesetze-im-internet.de/ustg_1980/__14.html                                                          |
| `negateLines`                                      | Stornorechnung                                              | Minuten und `netCents` exakt negiert, Steuerkategorie und -satz bleiben. `invoiceTotals(negateLines(lines))` ist die exakte Negation von `invoiceTotals(lines)`, weil `roundDiv` halb vom Nullpunkt weg rundet.                                                                                                                                                                                                        | –                                                                                                               |
| `isSmallAmountInvoice`, `SMALL_AMOUNT_LIMIT_CENTS` | § 33 UStDV                                                  | Kleinbetragsrechnung bis 250 € brutto, gemessen am Betrag (die Storno einer kleinen Rechnung bleibt klein), nie bei `reverse_charge`.                                                                                                                                                                                                                                                                                  | https://www.gesetze-im-internet.de/ustdv_1980/__33.html                                                         |
| `smallBusinessCheck`, `SMALL_BUSINESS_LIMITS`      | § 19 Abs. 1 UStG                                            | ab 1.1.2025 Vorjahr höchstens 25.000 €, laufendes Jahr höchstens 100.000 €. `previous_year_exceeded`, wenn der Vorjahresumsatz darüber lag; `crosses_current_limit`, sobald ausgestellte Rechnungen plus Entwurf die laufende Grenze übersteigen. Die Herleitung unterscheidet die Rechnung, die die Grenze überschreitet (`crosses_current_limit`), von jeder weiteren (`already_crossed`). Nur Warnung, nie Blocker. | https://www.gesetze-im-internet.de/ustg_1980/__19.html                                                          |
| `invoiceForm`                                      | § 14 Abs. 4, § 14a, § 19 UStG, § 33 UStDV, § 286 Abs. 3 BGB | Hinweisschlüssel `small_business_19`, `reverse_charge_13b`, `exempt_reason` und `late_payment_286_consumer` (nur Verbraucher). Blocker `vat_id_missing` bei Reverse Charge ohne eigene USt-IdNr., `tax_number_missing`, wenn weder Steuernummer noch USt-IdNr. hinterlegt sind und keine Kleinbetragsrechnung vorliegt. Hinweis `service_deadline_14a_1` bei Reverse Charge (Rechnung bis zum 15. des Folgemonats).    | https://www.gesetze-im-internet.de/ustg_1980/__14a.html, https://www.gesetze-im-internet.de/bgb/__286.html      |
| `budgetStatus`                                     | betrieblich                                                 | `ok` unter 80 %, `warn` ab 80 % bis einschließlich 100 %, `exceeded` darüber. Anteil als `Fraction`, die Herleitung nennt verbrauchte und budgetierte Minuten. Grundlage sind die gerundeten abrechenbaren Minuten, die der Aufrufer übergibt.                                                                                                                                                                         | –                                                                                                               |

Grenzen:

- **Steuer je Satzgruppe statt je Position** ist nicht von der Steuerberatung bestätigt
  (rechnungen-recht.md, offener Punkt 1; planung-projekte.md, Risiko 1). EN 16931 BR-CO-17 stützt
  die Gruppenrundung.
- **`EU_COUNTRY_CODES`** ist eine Annahme (Mitgliedstaaten ohne DE, Stand 2026, Griechenland als
  ISO-Code GR statt EL wie in der USt-IdNr.). rechnungen-recht.md enthält keine Liste; vor dem
  Livegang gegen die aktuelle EU-Mitgliedschaft prüfen.
- **Kleinbetragsrechnung ins Drittland** (`outside_scope`) bleibt möglich, weil rechnungen-recht.md
  dazu nichts sagt. Offene Annahme.
- **Daten der Steuersätze:** rechnungen-recht.md nennt 19 %/7 % ohne Datum. Die Einträge ab
  1.1.2007 und für das zweite Halbjahr 2020 sind vor dem Livegang am Gesetzestext zu prüfen.
  Leistungstage vor 2007 bekommen den ältesten Eintrag, historisch wäre das falsch.
- **Kleinunternehmergrenzen:** Ob brutto oder netto, Ist- oder Soll-Versteuerung gilt, ist bei
  unterjährigem Wechsel offen (rechnungen-recht.md, offener Punkt 6). `smallBusinessCheck`
  vergleicht nur die übergebenen Beträge. Jahre vor 2025 bekommen die Grenzen von 2025, obwohl die
  laufende Grenze vorher keine feste Obergrenze war.
- **Verbraucher im Drittland** gelten als `standard`; ob der Leistungsort nach § 3a UStG im
  Einzelfall ins Ausland wandert, ist nicht geprüft.
- **`tax_number_missing`** greift bei jeder Behandlung außer Reverse Charge, auch bei
  `small_business` (§ 34a UStDV verlangt Steuernummer oder USt-IdNr. ebenfalls) und bei
  `outside_scope`. Die Kleinunternehmer-Identifikationsnummer ist nicht abgebildet.
- **Zellen ohne Satz** lässt `linesFromCells` weg. Die aufrufende Seite muss sie als Blocker
  "fehlender Satz" melden, `invoiceForm` kennt die Zellen nicht.
- **Freie Positionen** (Menge × Einzelpreis) rechnet `rules` noch nicht. `invoiceTotals` nimmt sie
  über den Typ `TaxedAmount` mit auf, `negateLines` deckt nur Zeitpositionen ab.
- **XRechnung-Pflichtfelder** (BT-10, BT-49, Verkäuferkontakt) fehlen in `invoiceForm`, sie kommen
  mit Stufe 10e.
- Eine Zelle enthält neben Projekt, Aufgabe und Tag auch Person und Abrechenbarkeit im Schlüssel:
  Der Satz hängt an der Person, und abrechenbare und nicht abrechenbare Minuten dürfen nicht
  gemeinsam gerundet werden.
- **`linesFromCells` fasst nicht zusammenhängende Zeiträume in einer Position zusammen**, wenn
  Projekt, Aufgabe, Satz und Steuersatz zwischendurch zu einem früheren Wert zurückwechseln (ein
  aufgehobener Satz, oder die befristete Senkung 2020 gefolgt von der Rückkehr auf 19 %/7 %).
  `serviceFrom`/`serviceTo` überspannen dann auch die dazwischenliegende Phase mit einem anderen
  Satz, obwohl Minuten, Betrag und Steuer stimmen. § 31 Abs. 4 UStDV lässt als Leistungszeitraum
  ohnehin den Kalendermonat zu, ob getrennte Positionen trotzdem sinnvoller sind, ist offen.
- **`smallBusinessCheck` mit einem negativen `draftCents`** (Storno nach bereits überschrittener
  Grenze) kann wieder `ok` liefern, sobald die Summe unter die laufende Grenze fällt. Für den Beleg
  selbst ist das vertretbar, es ist aber keine Aussage darüber, ob die Befreiung im Jahr insgesamt
  wieder gilt (rechnungen-recht.md, offener Punkt 6).
- **`outside_scope`** (B2B im Drittland) bekommt in `invoiceForm` weder einen Rechtshinweis noch
  eine Pflicht auf die eigene USt-IdNr. rechnungen-recht.md Abschnitt 4 (Umsetzungsfolge) sieht
  beide USt-IdNr. und den Reverse-Charge-Hinweis auch für Leistungen ins Drittland vor,
  planung-projekte.md Abschnitt 3 nennt den Hinweis nur für `reverse_charge`. Was bei einem
  Leistungsort im Drittland (§ 3a Abs. 2 UStG) auf die Rechnung gehört, ist offen.
- **`exempt`** erreicht `invoiceForm` nur, wenn die aufrufende Seite die Kategorie einer einzelnen
  freien Position selbst als `treatment` übergibt. `taxTreatment` liefert `exempt` nie, weil eine
  Steuerbefreiung laut Plan je Position gewählt wird. Eine gemischte Rechnung mit einer
  steuerfreien Position bekommt über die aktuelle Verdrahtung also keinen `exempt_reason`
  (§ 14 Abs. 4 Nr. 8 UStG); das muss die aufrufende Seite je Position selbst aufrufen.
- **`Line` trägt keine Rohminuten**, nur `minutes` (bereits gerundet). `budgetStatus` erklärt seinen
  Zustand ebenfalls nur mit den übergebenen Minuten. planung-projekte.md nennt für beide Fälle
  Rohminuten als Teil der Herleitung; wer sie anzeigen will, muss sie an der Zelle (`Cell.rawMinutes`)
  selbst mitführen.

## projects/ (Abgleich Projektzeit und Arbeitszeit)

Betriebliche Regel, kein Gesetz (planung-projekte.md Abschnitt 2). Das Ergebnis ist ein Hinweis,
kein ArbZG-Befund, und erscheint nicht in `/compliance`.

| Funktion          | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectCoverage` | `(projectSpans, workSpans, { now, timeZone })` für einen Arbeitstag: `projectMinutes` und `workedMinutes` über `summarizeWorkday` (laufende Spannen werden mit `now` geschlossen, Spannen eines anderen Arbeitstags führen zu einem Fehler), `coveredMinutes` aus den Überschneidungen über `wholeMinutes`, daraus `outsideMinutes` und `unassignedMinutes`. `PROJECT_OVER_WORKED`, wenn die Projektzeit die Ist-Zeit um mehr als `COVERAGE_TOLERANCE_MINUTES` (5) übersteigt, `PROJECT_OUTSIDE_WORK`, wenn mehr als 5 Minuten außerhalb der gestempelten Intervalle liegen, auch in einer Pause (Lücken über `gapsBetween`). `facts.outside` enthält die nicht gedeckten Intervalle. |
| `timerHint`       | wahr, sobald ein Timer `TIMER_HINT_AFTER_MINUTES` (720, also 12 h) läuft. Eine Obergrenze für Einträge gibt es bewusst nicht, ein vergessener Timer ließe sich sonst nicht stoppen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

`coveredMinutes` wird einmal gerundet, die beiden anderen Werte sind Differenzen. Deshalb gelten
`covered + outside = project` und `covered + unassigned = worked` immer exakt.
`covered <= min(project, worked)` gilt im Regelfall, kann aber bei Sekundenstempeln, deren Summe
zufällig genau auf einer halben Minute liegt, um eine Minute verletzt werden (Rundungsfehler in
`calendar/wholeMinutes`, dritter Grenzpunkt unten).

Grenzen:

- Die Toleranz von 5 Minuten ist eine Auslegung, kein Gesetzeswert; sie steht als Konstante im Code.
  Sie gilt für die Summe des Tages, nicht je Abschnitt.
- `facts.outside` wird unabhängig von `outsideMinutes` aus den Instant-Überschneidungen gebildet und
  kann davon um bis zu eine Minute abweichen, weil `outsideMinutes` eine Differenz gerundeter Werte
  ist. Bei Sekundenstempeln an Timer- und Stempelgrenzen ist das der Normalfall, nicht die Ausnahme.
  Die Oberfläche soll die Intervalle als Uhrzeiten anzeigen, sie nicht neu aufsummieren.
- `wholeMinutes` aus `calendar/` summiert die Zeitspannen als Gleitkommazahl. Liegt die Summe exakt
  auf einer halben Minute, kann das Ergebnis von der Zerlegung der Buchungen abhängen (z. B. 461
  gerundete Minuten am Stück gegenüber 460 nach dem Aufteilen in mehrere Teilbuchungen). Das tritt
  bei sekundengenauen manuellen Einträgen auf, bei Zeitstempeln aus `now()` praktisch nie. Betrifft
  auch `aggregate` und alle anderen Aufrufer von `wholeMinutes`; ein Fix gehört in eine eigene
  Aufgabe für `calendar/index.ts`, außerhalb dieser Stufe.
- Überlappende Spannen innerhalb einer Quelle werden nicht erkannt. `time_entries` schließt sie per
  Exclusion-Constraint aus, für `project_entries` ist derselbe Constraint geplant
  (planung-projekte.md Abschnitt 1.2).
- Beide Quellen hängen am lokalen Beginndatum: Beginnt die Schicht am Vorabend und der
  Projekteintrag nach Mitternacht, stehen sie auf verschiedenen Arbeitstagen, und die Projektzeit
  erscheint als außerhalb.
- 29.03. und 25.10. zählen wie in `calendar/` über die exakte Dauer, der 23- und der 25-Stunden-Tag
  ergeben also die echten Minuten.

## Fraction

`packages/rules/src/fraction.ts` rechnet Urlaubstage als exakte Brüche (`{ num, den }`), damit
Rundung und Übertrag nie durch Gleitkommafehler driften. `toDecimal` rundet kaufmännisch (halb
aufgerundet) für die Anzeige.
