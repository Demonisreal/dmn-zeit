# 0004 PDF mit pdfkit, E-Rechnung mit @e-invoice-eu/core

Status: angenommen, 24.09.2026

## Kontext

PDFs entstehen bisher über die Druckansicht im Browser, Chromium kommt nicht in den Container. Für Rechnungen reicht das nicht:

- Das ausgestellte Original wird gespeichert und später unverändert ausgeliefert (GoBD, `invoice_documents` append-only mit sha256). Eine Druckansicht erzeugt kein Dokument auf dem Server.
- ZUGFeRD ist ein PDF/A-3 mit eingebettetem XML, XRechnung reines XML. Zulässig sind XRechnung und ZUGFeRD ab 2.0.1 in den Profilen BASIC, COMFORT, EN 16931 und EXTENDED, nicht MINIMUM und BASIC-WL (`docs/rechnungen-recht.md`, Abschnitt 7).
- Die Pflicht zur E-Rechnung im inländischen B2B-Verkehr kommt 2027 für Aussteller mit mehr als 800.000 € Vorjahresumsatz und 2028 für alle. Kleinunternehmer, Kleinbeträge bis 250 € und B2C sind ausgenommen.
- Der Stundennachweis gehört zur Rechnung und entsteht aus derselben Zuordnung der Zeiten.
- Die Vorschau eines Entwurfs soll genau so aussehen wie das ausgestellte Dokument.

## Entscheidung

- Rechnung und Stundennachweis rendert die API mit pdfkit (`documents/invoice-pdf.ts`, `documents/time-report-pdf.ts`): DIN 5008 Form B mit Anschriftfeld, Falz- und Lochmarken und Infoblock, PDF/A-3b mit eingebetteter TTF-Schrift unter OFL aus `apps/api/assets/fonts`. Die Schrift kommt aus einem festen Pfad, nie aus einem Pfad in den Daten.
- Die E-Rechnung erzeugt `@e-invoice-eu/core` 3.x (`documents/einvoice.ts`). Die Rechnung wird auf UBL-förmiges JSON abgebildet, `InvoiceService.generate` erzeugt daraus `Factur-X-EN16931` (ZUGFeRD) oder `XRECHNUNG-CII`. Für ZUGFeRD bekommt die Bibliothek das PDF aus pdfkit, bettet das XML ein und setzt XMP und sRGB mit pdf-lib. Genutzt wird nur der JSON-Eingang, LibreOffice kommt nicht ins Image.
- Ein Renderer für Vorschau und Original. Die Vorschau trägt ein Wasserzeichen und wird nicht gespeichert.
- Die Dokumente entstehen beim Ausstellen mit der vergebenen Nummer und liegen als `bytea` in `invoice_documents`. Der Download liefert das gespeicherte Original, `ETag` ist der sha256.
- `pdfkit` und `@e-invoice-eu/core` dürfen nur in `documents/` importiert werden (Regel für dependency-cruiser).
- CI prüft die XML-Ausgabe mit dem KoSIT-Validator (XRechnung-Konfiguration, Docker-Job) für die Fixtures 19 %, 7 %, gemischt, Reverse Charge, Drittland, Kleinunternehmer und Storno, dazu XML-Golden-Files. PDF/A-3b prüft veraPDF.

## Verworfen

- Druckansicht im Browser wie beim Stundenzettel: kein gespeichertes Original, kein PDF/A-3, kein eingebettetes XML.
- Chromium oder ein anderer Headless-Browser im Container: bleibt ausgeschlossen.
- HTML-Vorschau in der SPA neben dem PDF-Renderer: Vorschau und ausgestelltes Dokument könnten auseinanderlaufen.
- XML aus Template-Strings: Kundennamen oder Positionstexte könnten das XML brechen oder Elemente einschleusen (Bedrohungsmodell I-01).
- Die Wege über Tabellendateien und LibreOffice, die `@e-invoice-eu/core` anbietet: Lieferkette (Bedrohungsmodell I-09).
- ZUGFeRD MINIMUM und BASIC-WL: bilden die Pflichtangaben nicht vollständig im XML ab.

## Folgen

- "PDF über Druckansicht" gilt weiter für alles andere, Rechnung und Stundennachweis sind die Ausnahme.
- Die Vorschau lädt `/api/invoices/:id/preview.pdf` in einem iframe. Genau diese Route braucht eine Ausnahme vom globalen `frame-ancestors 'none'` und `X-Frame-Options: deny`. Weil das PDF als Blob in den iframe geladen wird, braucht die CSP außerdem `frame-src blob:`.
- pdfkit mit `subset: 'PDF/A-3b'` und die Nachbearbeitung mit pdf-lib können doppelte XMP-Metadaten erzeugen, Standard-14-Schriften scheiden aus. Nachweis per veraPDF. Lizenzen von Schrift und Bibliothek werden mit `pnpm licenses` geprüft.
- Die XRechnung-Pflichtfelder BT-10, BT-49 und der Verkäuferkontakt (`BR-DE-*`) werden gegen Spezifikation 3.0.x geprüft.
- Entschieden am 25.09.2026: Ausstellen vergibt Nummer und Schnappschüsse in einer Transaktion, gerendert wird erst nach dem Commit im Worker allein aus den Schnappschüssen (D-02). Scheitert das Rendern, bleibt die Rechnung ausgestellt und das Dokument wird beim nächsten Abruf erzeugt. PDFs werden getaggt, soweit pdfkit das hergibt; PDF/A-3b verlangt es nicht.
- Entschieden am 25.09.2026: Die Stornorechnung geht als Belegart 381 mit positiven Beträgen und Verweis auf die Originalnummer (BG-3) ins XML. 380 mit negativen Beträgen besteht den KoSIT-Validator ebenfalls (XRechnung 3.0.2, Konfiguration 2026-08-31), viele Empfänger buchen eine 380 aber als Forderung und scheitern an negativen Summen. 384 ersetzt eine Rechnung, statt sie aufzuheben. In der Oberfläche heißt sie weiter Stornorechnung, nie Gutschrift. Zahlungsart ist 97 (Verrechnung), damit niemand an die IBAN überweist.
- Die E-Rechnung liegt in `apps/api/src/einvoice/`, nicht in `documents/`. Die Regel für dependency-cruiser gilt für beide Ordner. Eingang ist ein schmaler Schnappschuss (`EInvoice`), `einvoiceBlockers` läuft vor der Nummernvergabe, damit das Rendern im Worker nicht mehr an fehlenden Angaben scheitert.
- Entschieden am 01.10.2026: Das PDF der Stornorechnung zeigt die Beträge negativ, wie sie gespeichert sind, das XML trägt sie als 381 positiv (siehe oben). Die Abweichung ist gewollt: Auf Papier liest sich die Stornorechnung als Gegenbuchung, im XML gilt die Vorzeichenregel der Belegart. Beide nennen das Original mit demselben Satz ("storniert Rechnung … vom …", im PDF unter dem Titel, im XML als BT-22), das PDF ohne Zahlungsziel, Bankverbindung und Verzugshinweis. Hinweistexte, Datumsformat und Stornosatz kommen für PDF und XML aus `einvoice/texts.ts`, `test/einvoice/text-parity.spec.ts` vergleicht beide je Fall. Offener Punkt für die Steuerberatung in `docs/rechnungen-recht.md`.
- pdfkit schreibt Titel und Autor unverändert ins XMP-Paket; ein `&` im Firmennamen machte das PDF/A ungültig. `escapeXmp` in `documents/pdf.ts` maskiert beide Werte nur dort, das Info-Dictionary bleibt lesbar. Die ZUGFeRD-Ausgabe betrifft das nicht, dort schreibt die Bibliothek das XMP neu; `verapdf.sh` prüft deshalb zusätzlich ein reines PDF mit `&` und `<` im Namen.
- Beim Abgleich mit dem KoSIT-Validator geklärt: Ohne USt-IdNr. steht die Steuernummer auch als Verkäuferkennung BT-29 im XML (BR-CO-26 zählt BT-32 nicht). Bei "nicht steuerbar" (O) entfallen beide USt-IdNr. (BR-O-2), der Satz 0 steht nur in der Aufschlüsselung (BR-DE-14), nicht an der Position (BR-O-5). Zeitpositionen laufen in Minuten mit Basismenge 60 zum Stundensatz, so bleibt der Positionsbetrag exakt. BT-72 ist das Ende des Leistungszeitraums, weil CII den Lieferblock verlangt und die Bibliothek ihn nur mit Inhalt schreibt.
- Stand 02.10.2026: Der Stundennachweis wird nicht als Anlage in die E-Rechnung eingebettet und nicht gespeichert. Mit Anlage überschritte der Renderlauf im Worker die Grenze von 5 s, außerdem schreibt `@e-invoice-eu/core` Anhänge zusätzlich als Base64 ins XML. `GET /invoices/:id/time-report` rendert ihn bei jedem Abruf aus der eingefrorenen Zuordnung (`invoice_line_entries`).
