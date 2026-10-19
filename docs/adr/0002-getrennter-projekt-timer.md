# 0002 Projekt-Timer getrennt von der Stempeluhr

Status: angenommen, 24.09.2026

## Kontext

dmn-zeit erfasst neben der Arbeitszeit auch Zeit auf Kunden, Projekte und Aufgaben, als Grundlage für Rechnungen. Die beiden Zeiten folgen verschiedenen Regeln:

- Die Stempeluhr (`time_entries`) ist die Arbeitszeitaufzeichnung nach § 16 Abs. 2 ArbZG. Buchungen werden nie überschrieben, Korrekturen laufen als Antrag über eine zweite Person, ein abgeschlossener Monat ist gesperrt, das ArbZG wird geprüft.
- Projektzeit soll bis zur Abrechnung frei korrigierbar bleiben und erst gesperrt sein, wenn sie in einer Rechnung steht.
- Im Solo-Bereich gibt es keine `time_entries`, die Policy `"company workspace"` sperrt sie. Dort ist der Projekt-Timer die einzige Uhr.

Das Bedrohungsmodell (`docs/bedrohungsmodell-rechnungen.md`, Abschnitt 4, R-09, T-04, T-05) ging noch von einer Aufteilung der gestempelten Zeit auf Projekte aus: Projektbuchungen mit Verweis auf `time_entries`, höchstens so viele Projektminuten wie gearbeitete Minuten, Monatssperre auch für Projektzeiten.

## Entscheidung

Entschieden am 24.09.2026: Der Projekt-Timer ist getrennt von der Stempeluhr, der Abgleich mit der Arbeitszeit ist nur ein Hinweis. Der Timer ergänzt die Stempeluhr, im Betrieb ersetzt er sie nicht.

- Projektzeiten liegen in `app.project_entries` mit eigenem Timer. `time_entries` bleiben unverändert.
- Nachträge brauchen keinen Antrag, aber eine Notiz. Keine ArbZG-Prüfung, keine Monatssperre. Gesperrt ist eine Projektzeit nur, solange ein Rechnungsentwurf oder eine Rechnung sie hält (`ZT004` -> 409 `INVOICED`).
- Wie bei der Stempeluhr gilt die Uhr der Datenbank: Der Timer beginnt und endet mit `now()`. Je Person läuft höchstens ein Timer (partieller Unique-Index), Überlappungen verhindert `EXCLUDE USING gist` wie bei `time_entries`. Ein Start bei laufendem Timer beendet den alten in derselben Transaktion.
- Löschen heißt `voided_at` setzen. Änderungen stehen über `audit.track` im Protokoll.
- `rules.projectCoverage` vergleicht je Arbeitstag Projekt- und Arbeitszeit und liefert `PROJECT_OVER_WORKED` und `PROJECT_OUTSIDE_WORK`, mit `COVERAGE_TOLERANCE_MINUTES = 5`. Die Hinweise stehen in der Projektwoche und der Team-Projektansicht, nicht in `/compliance` und nicht in der Checkliste des Monatsabschlusses.
- Der Stempelknopf bleibt die rote Hauptaktion, der Projekt-Timer ist eine Nebenaktion. Wer bei laufendem Timer ausstempelt, wird gefragt, ob der Timer auch stoppen soll; das sind zwei getrennte Aufrufe.

## Verworfen

- Projektzeit als Aufteilung der Stempelzeit, wie im Bedrohungsmodell angenommen: Jede Korrektur für die Abrechnung hätte die Arbeitszeitaufzeichnung berührt, und eine Rechnung hätte umgekehrt Korrekturanträge an Buchungen blockiert (R-09 sah dafür einen eigenen Abbruch vor). Im Solo-Bereich gäbe es nichts aufzuteilen.
- Abgleich als Sperre, Projektminuten höchstens Ist-Minuten (T-05): koppelt beide Quellen wieder. Schon die Reihenfolge von Stempeln und Timerstart erzeugt kleine Abweichungen, dafür gibt es die Toleranz.
- Obergrenze für einen Eintrag, etwa 24 h (T-02): Ein vergessener Timer ließe sich nicht mehr stoppen. Stattdessen gibt es ab 12 h einen Hinweis, und der Stopp-Dialog bietet an, das Ende zu korrigieren.
- Entwürfe ohne Reservierung der Zeiten, dafür eine Prüfung auf Veraltung beim Ausstellen: erzeugt veraltete Entwürfe.

## Folgen

- Abrechnungskorrekturen berühren die Arbeitszeitaufzeichnung nie. Projektzeit bleibt bis zur Abrechnung korrigierbar, mit Protokoll.
- Einstempeln startet keinen Projekt-Timer. Wer im Betrieb Projektzeit erfasst, stempelt und startet den Timer getrennt.
- Solange ein Entwurf Zeiten hält, kann die Person ihre eigene Projektzeit nicht ändern (409 `INVOICED`). Die Meldung muss sagen, dass sie sich an die Personalverwaltung wenden soll.
- Arbeits- und Projektzeit können auseinanderlaufen, die Software zeigt das nur an.
- Für Projektzeiten gibt es in v1 keinen Löschpfad. Ob sie wie die Rechnung acht Jahre aufzubewahren sind, ist offen (`docs/rechnungen-recht.md`, offener Punkt 4). Die Zuordnung der Zeiten zu den Rechnungspositionen (`invoice_line_entries`) bleibt deshalb erhalten, der Stundennachweis lässt sich daraus jederzeit neu rendern.
