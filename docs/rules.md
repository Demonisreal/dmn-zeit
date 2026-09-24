# Fachlogik @zeit/rules

Stand 24.09.2026. Beschreibt, was `packages/rules` rechnet, auf welcher Rechtsgrundlage und wo
die Grenzen von Stufe 1 liegen. Die Software gibt Hinweise, keine Rechtsberatung (siehe
PRODUCT.md). Alle Paragrafen wurden gegen gesetze-im-internet.de geprüft (Rechercheergebnis vom
24.09.2026), Feiertage gegen die unten genannten Quellen.

## calendar/

| Funktion           | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workdayOf`        | Arbeitstag einer Buchung = lokales Datum ihres Beginns (Datenmodell, planung.md Abschnitt "Datenmodell").                                                                                                                                                                                                                                                                                                                                                                            |
| `splitByLocalDate` | Zerlegt eine Zeitspanne in Tagesabschnitte je lokalem Kalendertag, auch am 23-Stunden-Tag (29.03.2026) und am 25-Stunden-Tag (25.10.2026).                                                                                                                                                                                                                                                                                                                                           |
| `monthDays`        | Alle Kalendertage eines Monats.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `gapsBetween`      | Lücken zwischen aufeinanderfolgenden Zeitspannen, nach Beginn sortiert. Sich berührende oder überlappende Spannen ergeben keine Lücke. Einzige Lückenrechnung, `summarizeWorkday` und `checkWorkdays` nutzen sie beide.                                                                                                                                                                                                                                                              |
| `summarizeWorkday` | `(entries, now, timeZone)` für einen Arbeitstag: `workedMinutes`, `breakMinutes`, `gaps`, `firstStart`, `lastEnd`, `running`. Eine laufende Buchung (`end: null`) wird mit `now` geschlossen. Pause ist jede Lücke zwischen zwei Buchungen, auch unter 15 min; eine Pause nach der letzten Buchung zählt erst, wenn wieder gestempelt wird. Minuten werden auf ganze Minuten gerundet, weil die Stempel Sekunden tragen. Buchungen verschiedener Arbeitstage führen zu einem Fehler. |

Grenzen:

- Rein kalendarisch, keine Sonderfälle für Schaltsekunden oder historische Zeitzonenwechsel vor 1970.
- Eine Nachtschicht mit Pause nach Mitternacht zerfällt in zwei Arbeitstage, weil die zweite
  Buchung nach dem Datenmodell zum Folgetag gehört. Die Lücke ist dann keine Pause, sondern
  Ruhezeit und löst `ARBZG_5_REST_UNDER_11H` aus.
- `summarizeWorkday` rundet auf ganze Minuten, `checkWorkdays` rechnet sekundengenau. An der Grenze
  (z. B. 8 h 0 min 20 s) zeigt der Tag 480 Minuten und trotzdem `ARBZG_3_OVER_8`.

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
| `ARBZG_5_REST_UNDER_11H` | § 5 Abs. 1 | Ruhezeit zwischen zwei Arbeitstagen unter 11 h                                                                  | https://www.gesetze-im-internet.de/arbzg/__5.html |
| `ARBZG_9_SUNDAY`         | § 9 Abs. 1 | Arbeit an einem Sonntag                                                                                         | https://www.gesetze-im-internet.de/arbzg/__9.html |
| `ARBZG_9_HOLIDAY`        | § 9 Abs. 1 | Arbeit an einem gesetzlichen Feiertag (`portion: 1`); die betrieblichen halben Tage 24./31.12. lösen nichts aus | https://www.gesetze-im-internet.de/arbzg/__9.html |

`checkWorkdays(days, { timeZone, holidays, range })` meldet nur Befunde für Tage innerhalb von
`range` (beide Enden eingeschlossen). Tage davor dienen nur als Vorlauf für die Ruhezeit des
ersten Tags, der Aufrufer gibt also den Vortag mit. Die Pausen kommen aus `gapsBetween`, derselben
Lückenrechnung wie in `summarizeWorkday`; für § 4 zählen davon nur Lücken ab 15 min.

`RULESETS` versioniert die Grenzwerte über `validFrom`; eine Reform wird ein neuer Eintrag, alte
Befunde behalten ihre `ruleVersion`.

Grenzen:

- Die Ausnahmen der §§ 10–11 ArbZG (Gesundheitswesen, Gastronomie, Notdienste, Verschiebung der
  Sonntagsruhe im Schichtbetrieb) fehlen in v1. Sonntags- und Feiertagsarbeit ergibt deshalb
  immer eine Warnung.
- `ARBZG_9_SUNDAY` hängt am lokalen Startdatum der Schicht: Eine Nachtschicht Samstag 22:00 bis
  Sonntag 6:00 löst den Befund nicht aus, obwohl nach 0 Uhr Sonntagsarbeit stattfindet. Eine exakte
  Lösung bräuchte `splitByLocalDate` pro Schicht statt pro Arbeitstag.
- Die Schwellen 6 h und 9 h für die Pausenpflicht sind im Code fest verdrahtet, nicht im Typ
  `Limits`; eine Reform, die diese Schwellen selbst ändert, bräuchte zusätzliche Felder.
- Überlappende Schichten an einem Tag werden nicht erkannt; das muss die API vor dem Aufruf
  validieren.
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

| Funktion            | Paragraf                                        | Regel                                                                                                                                                                                                                                                                                                                                                                                          | Quelle                                                                                                            |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `annualEntitlement` | § 3 Abs. 1, § 4, § 5 Abs. 1 Buchst. a–c, Abs. 2 | `(employment, year, asOf)`: Wartezeit 6 Monate, Zwölftelung im Eintritts- und (früh im Jahr endenden) Austrittsjahr, voller Anspruch beim Ausscheiden nach dem 30.6. erst, wenn `asOf` das Ende der Wartezeit erreicht hat, Aufrundung ab einem halben Tag. Solange die Wartezeit am Stichtag läuft, kommt die Erklärung `vacation.entitlement.waiting_period` mit ihrem letzten Tag (`until`) | https://www.gesetze-im-internet.de/burlg/__4.html, https://www.gesetze-im-internet.de/burlg/__5.html              |
| `daysForRange`      | § 3 Abs. 1                                      | ein geplanter Arbeitstag kostet einen (halben) Urlaubstag, Feiertage und arbeitsfreie Tage kosten nichts                                                                                                                                                                                                                                                                                       | –                                                                                                                 |
| `allocate`          | betrieblich, § 7 Abs. 3                         | `(days, buckets)` mit `days` = Ausgabe von `daysForRange`: jeder Tag wird aus dem Topf mit der frühesten Frist bezahlt, der an diesem Datum gilt (ab 1.1. seines Jahres bis einschließlich Frist). Tage in Datumsreihenfolge, ein Tag kann sich auf zwei Töpfe verteilen. Ergebnis je Datum und Topf plus Fehlbetrag                                                                           | –                                                                                                                 |
| `expiryDecision`    | § 7 Abs. 3, BAG 19.02.2019 – 9 AZR 541/15       | Übertragungsfrist 31.3., Verfall nur nach dokumentiertem, konkretem Hinweis des Arbeitgebers; die Frist selbst bleibt bis einschließlich ihres letzten Tages nutzbar                                                                                                                                                                                                                           | https://www.gesetze-im-internet.de/burlg/__7.html, https://www.bundesarbeitsgericht.de/entscheidung/9-azr-541-15/ |
| `sickRefund`        | § 9                                             | ärztlich nachgewiesene Krankheitstage im Urlaub werden zurückgebucht                                                                                                                                                                                                                                                                                                                           | https://www.gesetze-im-internet.de/burlg/__9.html                                                                 |

Ergänzend bestätigt, aber in v1 nicht als eigene Regel abgebildet: BAG 20.12.2022 – 9 AZR 266/20
(die dreijährige Verjährung nach § 199 Abs. 1 BGB beginnt erst mit dem Jahr der ordnungsgemäßen
Mitwirkung des Arbeitgebers) – relevant für den Monatsabschluss- und Exportbereich, nicht für
`rules` selbst.

Grenzen:

- **Eintritt bis 30.6.:** Auch dann wird gezwölftelt (Produktvorgabe "anteiliger Anspruch bei
  Eintritt"). § 5 Abs. 1 Buchst. a sieht Teilurlaub aber nur vor, wenn die Wartezeit im
  Eintrittsjahr nicht mehr endet; sonst entsteht nach § 4 der volle gesetzliche Mindesturlaub
  (§ 3). Ein Vertrag nahe am Mindesturlaub kann im Eintrittsjahr darunter fallen, eine Prüfung
  gegen den Mindesturlaub fehlt.
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

## Fraction

`packages/rules/src/fraction.ts` rechnet Urlaubstage als exakte Brüche (`{ num, den }`), damit
Rundung und Übertrag nie durch Gleitkommafehler driften. `toDecimal` rundet kaufmännisch (halb
aufgerundet) für die Anzeige.
