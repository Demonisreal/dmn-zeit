# Fachliche Vorgabe: Projektzeiten und Rechnungen

Stand 24.09.2026. Grundlage für das Rechnungsmodul (Freelancer/kleine Betriebe, Rechnungsstellung
auf Basis erfasster Projektzeiten). Die Software gibt Hinweise, keine Rechtsberatung (siehe
PRODUCT.md). Primärquellen sind Gesetzestexte auf gesetze-im-internet.de und BMF-Schreiben,
ergänzend IHK-Merkblätter, Steuerberaterkammern und Fachredaktionen (Haufe, NWB, Lexware) dort, wo
kein Gesetzestext die Detailfrage beantwortet. Alle Quellen wurden am 24.09.2026 abgerufen.

Die Rechtslage zur E-Rechnung ändert sich bis 2028 in mehreren Stufen. Wo das der Fall ist, steht
das Datum der Änderung direkt bei der Regel, nicht nur im E-Rechnung-Abschnitt.

## 1. Pflichtangaben, Kleinbetragsrechnung, Leistungszeitraum

**Regel:** Eine Rechnung nach § 14 Abs. 4 UStG muss enthalten: vollständiger Name und Anschrift
von leistendem Unternehmer und Leistungsempfänger, Steuernummer oder USt-IdNr. des leistenden
Unternehmers, Ausstellungsdatum, fortlaufende Rechnungsnummer, Menge und Art der Leistung,
Zeitpunkt der Leistung (bzw. der Vereinnahmung des Entgelts bei Anzahlungen), das nach Steuersätzen
und -befreiungen aufgeschlüsselte Entgelt, im Voraus vereinbarte Entgeltminderungen, den
anzuwendenden Steuersatz und den Steuerbetrag oder bei Steuerbefreiung einen Hinweis darauf.
Bei Zeitabrechnung genügt nach § 31 Abs. 4 UStDV die Angabe des Kalendermonats als
Leistungszeitraum, ein exaktes Datum ist nicht nötig.

Kleinbetragsrechnungen bis 250 Euro Gesamtbetrag (§ 33 UStDV) brauchen nur: vollständiger Name
und Anschrift des leistenden Unternehmers, Ausstellungsdatum, Menge/Art der Leistung, Entgelt und
Steuerbetrag in einer Summe mit Steuersatz bzw. Hinweis auf Steuerbefreiung. Rechnungsnummer,
Anschrift des Empfängers und Steuernummer entfallen. Ausgenommen von der Kleinbetragsregelung sind
u. a. innergemeinschaftliche Lieferungen und Fälle von § 13b UStG (Reverse Charge) — dort gelten
immer die vollen Pflichtangaben.

**Umsetzungsfolge:** Rechnung erzwingt alle Pflichtfelder aus § 14 Abs. 4 UStG als Minimum;
Kleinbetragsrechnung ist kein separater Belegtyp, sondern eine reduzierte Druckansicht/Datensicht
ab Gesamtbetrag ≤ 250 Euro, sofern kein Ausschlussfall (Reverse Charge, innergemeinschaftlich)
vorliegt. Leistungszeitraum wird aus den zugrunde liegenden Zeitbuchungen als Zeitraum
(von–bis, mindestens Kalendermonat) übernommen, nicht als Einzeldatum je Buchung.

**Quelle:** § 14 Abs. 4 UStG (https://www.gesetze-im-internet.de/ustg_1980/__14.html),
§ 31 Abs. 4 UStDV und § 33 UStDV
(https://www.gesetze-im-internet.de/ustdv_1980/__33.html).

## 2. Fortlaufende Rechnungsnummer

**Regel:** § 14 Abs. 4 Nr. 4 UStG verlangt "eine fortlaufende Nummer mit einer oder mehreren
Zahlen- oder Buchstabenreihen, die zur Identifizierung der Rechnung vom Rechnungsaussteller
einmalig vergeben wird". Gefordert ist Einmaligkeit, nicht Lückenlosigkeit — eine lückenlose Folge
verlangt die Finanzverwaltung nicht. Mehrere parallele Nummernkreise sind zulässig (z. B. je
Standort, je Mandant, je Jahr mit Präfix). Fehlt eine fortlaufende Nummerierung ganz oder gibt es
zusammen mit anderen Auffälligkeiten (fehlende Belege, ungeklärte Kontobewegungen) Indizien für
nicht erfasste Einnahmen, kann das Finanzamt eine Hinzuschätzung vornehmen — allein aus Lücken in
der Nummernfolge darf sie das nicht.

**Umsetzungsfolge:** Nummerierung pro Mandant und pro definiertem Nummernkreis (z. B.
Jahrespräfix `2026-0001`) fortlaufend und ohne Wiederverwendung vergeben, keine Pflicht zur
Lückenlosigkeit im Sinn einer nachträglichen Prüfung erzwingen. Stornierte Nummern bleiben
sichtbar vergeben (siehe Abschnitt 6), nicht neu ausgeben.

**Quelle:** § 14 Abs. 4 Nr. 4 UStG; IHK Frankfurt am Main, Merkblatt Pflichtangaben in der
Rechnung (https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/steuerrecht/umsatzsteuer-national/rechnungen-pflichtangaben-in-der-rechnung-5195692);
IHK Hannover, gleichnamiges Merkblatt
(https://www.ihk.de/hannover/hauptnavigation/recht/steuerrecht/umsatzsteuer/pflichtangaben-in-rechnungen-5217552).

## 3. Kleinunternehmerregelung § 19 UStG (Reform ab 01.01.2025)

**Regel:** Durch das Jahressteuergesetz 2024 wurde § 19 UStG zum 01.01.2025 neu gefasst. Die
Steuerbefreiung gilt, wenn der Gesamtumsatz im Vorjahr 25.000 Euro nicht überschritten hat und im
laufenden Kalenderjahr 100.000 Euro nicht übersteigt. Anders als bisher ist die 100.000-Euro-Grenze
eine echte Obergrenze: Wird sie im laufenden Jahr überschritten, entfällt die Steuerbefreiung ab
dem Umsatz, der die Grenze überschreitet, nicht erst zum Jahreswechsel. Für Kleinunternehmer
anderer EU-Mitgliedstaaten gilt seit derselben Reform ein unionsweiter Schwellenwert von
100.000 Euro, wodurch die Regelung erstmals grenzüberschreitend nutzbar ist.

Seit 01.01.2025 gilt außerdem eine eigene, reduzierte Pflichtangaben-Liste für
Kleinunternehmer-Rechnungen nach dem neu eingefügten § 34a UStDV: Name/Anschrift beider Parteien,
Steuernummer/USt-IdNr./Kleinunternehmer-Identifikationsnummer, Menge/Art der Leistung, Entgelt in
einer Summe sowie ein Hinweis auf die Steuerbefreiung nach § 19 UStG. Rechnungsnummer und
Leistungsdatum gehören nach § 34a UStDV nicht zur Mindestangabe, dürfen aber weiter angegeben
werden. Ein möglicher Wortlaut für den Pflichthinweis: "Steuerbefreite Kleinunternehmerrechnung,
kein Steuerausweis gemäß § 19 UStG."

**Umsetzungsfolge:** Mandantenprofil trägt Kennzeichen "Kleinunternehmer" mit den beiden
Umsatzgrenzen (25.000 Euro Vorjahr, 100.000 Euro laufendes Jahr); System warnt, sobald der
laufende Umsatz die 100.000-Euro-Grenze übersteigt, weil die Befreiung dann unterjährig endet.
Rechnungsvorlage für Kleinunternehmer zeigt keinen Steuerausweis, druckt stattdessen den
Pflichthinweis nach § 19 UStG und verlangt nicht zwingend Rechnungsnummer/Leistungsdatum als
Pflichtfeld (Software vergibt sie trotzdem automatisch, das ist zulässig).

**Auswirkung auf E-Rechnung:** Kleinunternehmer sind nach § 34a UStDV von der Pflicht befreit,
E-Rechnungen auszustellen — Papier- oder PDF-Rechnung bleibt für sie dauerhaft zulässig, auch nach
2027/2028. Von der Empfangspflicht sind sie nicht befreit: Sie müssen seit 01.01.2025 eingehende
E-Rechnungen von Lieferanten annehmen und archivieren können (siehe Abschnitt 7).

**Quelle:** § 19 UStG n. F.
(https://www.gesetze-im-internet.de/ustg_1980/__19.html), § 34a UStDV
(https://www.gesetze-im-internet.de/ustdv_1980/__34a.html), Jahressteuergesetz 2024 (BGBl. 2024 I
Nr. 387 v. 02.12.2024); IHK Region Stuttgart, Kleinunternehmerregelung, Umsatzgrenzen, § 19 UStG
(https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/steuerrecht/umsatzsteuer-national/kleinunternehmerregelung-in-der-umsatzsteuer-1843632).

## 4. Reverse Charge § 13b UStG bei Leistungen ins Ausland

**Regel:** Erbringt der Unternehmer eine sonstige Leistung an einen Unternehmer im übrigen
Gemeinschaftsgebiet oder im Drittland und schuldet nicht er, sondern der Leistungsempfänger die
Steuer, muss die Rechnung nach § 14a Abs. 1 bzw. Abs. 5 UStG zusätzlich enthalten: die
USt-IdNr. des leistenden Unternehmers und die des Leistungsempfängers sowie den Hinweis
"Steuerschuldnerschaft des Leistungsempfängers". Ein gesonderter Steuerausweis unterbleibt in
diesem Fall. Bei innergemeinschaftlichen Lieferungen/Leistungen ist die Rechnung zusätzlich bis
zum 15. Tag des Monats zu stellen, der auf den Monat der Leistung folgt (§ 14a Abs. 1 S. 2 UStG; Abs. 3 gilt für innergemeinschaftliche Lieferungen).

Für innergemeinschaftliche Leistungen an Unternehmer in der EU ist außerdem eine Zusammenfassende
Meldung nach § 18a UStG an das Bundeszentralamt für Steuern abzugeben — das betrifft die
Steuererklärung des leistenden Unternehmers, nicht den Rechnungsinhalt, und wird hier nur als
Hinweis geführt, ohne eigene Softwarelogik in Version 1.

**Umsetzungsfolge:** Rechnungsvorlage für B2B-Leistungen mit Leistungsort im EU-Ausland oder
Drittland zeigt beide USt-IdNr.-Felder als Pflichtfeld, setzt Steuersatz auf 0 % ohne Ausweis und
druckt automatisch den Reverse-Charge-Hinweis; kein Steuerbetrag in der Summe. Zusammenfassende
Meldung bleibt außerhalb der Software (Hinweistext im Handbuch/Onboarding, keine Meldefunktion).

**Quelle:** § 13b UStG (https://www.gesetze-im-internet.de/ustg_1980/__13b.html), § 14a UStG
(https://www.gesetze-im-internet.de/ustg_1980/__14a.html), § 18a UStG.

## 5. Steuersätze, Rundung, Netto-/Bruttoausweis

**Regel:** Regelsteuersatz 19 % (§ 12 Abs. 1 UStG), ermäßigter Satz 7 % (§ 12 Abs. 2 UStG) für die
dort abschließend aufgezählten Leistungen. Ein Steuersatz von 0 % bei voller Vorsteuerabzugs-
berechtigung existiert für bestimmte Photovoltaikanlagen-Lieferungen (§ 12 Abs. 3 UStG, seit
01.01.2023) und ist von echten Steuerbefreiungen ohne Vorsteuerabzug (§ 4 UStG, z. B. Ausfuhr,
innergemeinschaftliche Lieferung) zu unterscheiden — für ein Zeiterfassungs-/Rechnungsmodul für
Freelancer/kleine Betriebe ist praktisch nur der Regelfall 19 %, seltener 7 %, relevant.

**Gegenprüfen:** Zur Rundung — je Rechnungsposition oder erst auf den Gesamtbetrag der Rechnung —
wurde keine eindeutige Aussage in einer frei zugänglichen Primärquelle (Gesetzestext, UStAE)
gefunden; die UStAE-Randnummer zu § 14 Abs. 5 (Abschn. 14.5) war zum Rechercheseitpunkt technisch
nicht abrufbar. In der Praxis wird verbreitet kaufmännisch je Position auf zwei Nachkommastellen
gerundet und die Summe aus den gerundeten Positionsbeträgen gebildet; das ist vor Umsetzung mit
Steuerberatung zu bestätigen, insbesondere im Zusammenspiel mit Sammelrechnungen über mehrere
Leistungszeiträume.

**Umsetzungsfolge:** Steuersatz ist Stammdatum je Leistungsposition, nicht je Rechnung, damit
gemischte Rechnungen (19 %/7 %/steuerfrei) möglich sind. Ausweis immer netto je Position, Steuer
je Satz aufsummiert, Bruttosumme am Ende — bis zur Klärung der Rundungsfrage kaufmännische Rundung
je Position auf 2 Nachkommastellen, Steuerbetrag je Steuersatzgruppe aus der Summe der gerundeten
Nettobeträge berechnen (nicht aus der Summe der ungerundeten Einzelsteuerbeträge), um
Rundungsdifferenzen nachvollziehbar zu halten.

**Quelle:** § 12 Abs. 1–3 UStG (https://www.gesetze-im-internet.de/ustg_1980/__12.html), § 4 UStG
(https://www.gesetze-im-internet.de/ustg_1980/__4.html).

## 6. Korrektur und Storno

**Regel:** Eine ausgestellte und dem Empfänger übermittelte Rechnung gilt nach den GoBD als
festgeschrieben und darf nicht mehr verändert werden (Grundsatz der Unveränderbarkeit). Fehlende
oder fehlerhafte Pflichtangaben werden nach § 31 Abs. 5 UStDV korrigiert: Es muss nicht die ganze
Rechnung neu geschrieben werden, es genügt ein Dokument, das die fehlenden oder falschen Angaben
richtigstellt und eindeutig und spezifisch auf die ursprüngliche Rechnung Bezug nimmt (Rechnungs-
nummer, Datum). Für inhaltliche Fehler, die die Leistung/das Entgelt selbst betreffen (falscher
Betrag, falsche Leistung), ist die Stornorechnung der praxisübliche Weg: Sie hebt die ursprüngliche
Rechnung vollständig auf (Betrag negativ, Verweis auf die stornierte Rechnungsnummer), danach wird
bei Bedarf eine neue, korrekte Rechnung mit neuer Nummer gestellt.

Der Begriff "Gutschrift" ist seit dem Amtshilferichtlinie-Umsetzungsgesetz 2013 umsatzsteuerlich
ausschließlich für die vom Leistungsempfänger ausgestellte Rechnung reserviert (Selbstbilling,
§ 14 Abs. 2 Satz 2 UStG) und darf im Sinne einer Rechnungskorrektur (kaufmännische Gutschrift)
nicht mehr verwendet werden — Fehlbezeichnung kann den Vorsteuerabzug beim Empfänger gefährden.

**Umsetzungsfolge:** Rechnung ist nach Versand/Freigabe schreibgeschützt in Business-Feldern
(Beträge, Positionen, Leistungszeitraum, Empfänger). Korrektur nur über zwei Wege: (a)
Berichtigungsdokument für reine Formfehler mit Verweis auf Original-Rechnungsnummer, (b)
Stornorechnung mit Verweis auf die stornierte Nummer plus optional neue Folgerechnung. Kein
In-Place-Edit einer versendeten Rechnung, auch nicht für Tippfehler in Adresse oder Leistungstext
— dafür ist immer Weg (a) zu nutzen. Der Begriff "Gutschrift" wird in der Oberfläche nicht für
Rechnungskorrekturen verwendet.

**Quelle:** § 31 Abs. 5 UStDV; § 14 Abs. 2 Satz 2 UStG
(https://www.gesetze-im-internet.de/ustg_1980/__14.html); GoBD-Grundsatz der Unveränderbarkeit,
BMF-Schreiben v. 11.03.2024 (Az. IV D 2 – S 0316/21/10001:002),
https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/AO-Anwendungserlass/2024-03-11-aenderung-gobd.pdf.

## 7. E-Rechnung (Übergang 2025–2028)

**Regel:**

- Seit **01.01.2025**: Jedes inländische Unternehmen muss E-Rechnungen empfangen können; ein
  einfaches E-Mail-Postfach genügt dafür. Ausstellung ist bis Ende 2026 für alle noch optional
  (mit Zustimmung des Empfängers auch Papier/PDF weiterhin zulässig).
- **01.01.2027**: Ausstellungspflicht für B2B-Umsätze zwischen inländischen Unternehmern, sofern
  der Gesamtumsatz des Rechnungsausstellers im vorangegangenen Kalenderjahr (2026) über
  800.000 Euro lag.
- **01.01.2028**: Ausstellungspflicht für alle inländischen B2B-Umsätze unabhängig vom Umsatz;
  Papier- und einfache PDF-Rechnungen ohne strukturierten Datenteil sind dann nicht mehr zulässig.
- **Ausnahmen von der Ausstellungspflicht** (unabhängig vom Datum): Kleinbetragsrechnungen bis
  250 Euro, Kleinunternehmer nach § 34a UStDV, Fahrausweise, bestimmte steuerfreie Umsätze nach
  § 4 Nr. 8–29 UStG, Leistungen an Nicht-Unternehmer (B2C bleibt in jedem Fall formfrei).
- **Zulässige Formate:** XRechnung sowie ZUGFeRD ab Version 2.0.1 in den Profilen BASIC, COMFORT,
  EN 16931 und EXTENDED. Die Profile MINIMUM und BASIC-WL erfüllen die Vorgaben nicht, weil sie
  nicht alle umsatzsteuerlich vorgeschriebenen Pflichtangaben vollständig im strukturierten
  XML-Teil abbilden.
- B2C-Rechnungen bleiben in jedem Fall formfrei (Papier, PDF, E-Rechnung — alles zulässig, keine
  Pflicht).

**Umsetzungsfolge:** Mandantenprofil trägt Feld "Vorjahresumsatz" zur Berechnung, ab wann die
Ausstellungspflicht für diesen Mandanten beginnt (2025/2026 optional, ab 2027 bei > 800.000 Euro
Vorjahresumsatz Pflicht, ab 2028 für alle Pflicht). Rechnungsausgabe erzeugt wahlweise
XRechnung (reines XML) oder ZUGFeRD im Profil EN 16931 (PDF mit eingebettetem XML) — MINIMUM und
BASIC-WL werden als Ausgabeformat nicht angeboten. Eingangsseite (Buchhaltung/Belegablage) muss ab
01.01.2025 in jedem Fall E-Rechnungen im XML- bzw. ZUGFeRD-Format annehmen und archivieren können,
auch wenn der Mandant selbst noch nicht ausstellungspflichtig ist. Kleinunternehmer-Rechnungen
bleiben von der Ausstellungspflicht dauerhaft ausgenommen (Abschnitt 3), erhalten aber trotzdem
Empfangspflicht.

**Quelle:** § 14 Abs. 2 Satz 2 UStG (E-Rechnungs-Definition), BMF-Schreiben v. 15.10.2024 (Az.
III C 2 – S 7287-a/23/10001 :007), Folgeschreiben v. 15.10.2025 (Az.
III C 2 – S 7287-a/00019/007/243); BMF-FAQ E-Rechnung
(https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html); Wachstumschancengesetz
(BGBl. 2024 I Nr. 108 v. 27.03.2024) für die Fristen 2025/2027/2028 und die 800.000-Euro-Grenze;
zu den ZUGFeRD-Profilen: KoSIT/FeRD-Spezifikation ZUGFeRD 2.x, Profilbeschreibung EN 16931.
**Gegenprüfen:** genaue Profilliste (BASIC vs. BASIC-WL) und die exakte Fundstelle im
BMF-Schreiben direkt am Originaldokument, nicht nur an Sekundärquellen, nachvollziehen.

## 8. GoBD: Unveränderbarkeit, Protokollierung, Aufbewahrung

**Regel:** Die GoBD verlangen, dass Buchungen und Aufzeichnungen nach Erfassung nicht mehr ohne
Nachvollziehbarkeit verändert werden können; jede Änderung (auch Stornierung) muss protokolliert
werden (wer, wann, was). Durch das Vierte Bürokratieentlastungsgesetz wurde die Aufbewahrungsfrist
für Buchungsbelege — dazu zählen ausgestellte und empfangene Rechnungen — in § 257 Abs. 1 Nr. 4
HGB und § 147 Abs. 3 AO von zehn auf **acht Jahre** verkürzt. Die Änderung ist am **01.01.2025**
in Kraft getreten. Übergangsregel: Sie gilt erstmals für Unterlagen, deren bisherige
Zehn-Jahres-Frist zu diesem Stichtag noch nicht abgelaufen war — bereits abgelaufene Fristen leben
dadurch nicht wieder auf.

Nach dem BMF-Schreiben vom 14.07.2025 zur GoBD (Az. IV D 2 – 0316/00128/005/088) müssen
aufbewahrungspflichtige Belege, die als strukturierter Datensatz (z. B. E-Rechnung) empfangen
wurden, nicht zusätzlich bildlich (PDF/Papier) aufbewahrt werden — der strukturierte Datensatz
selbst genügt. Wird ein Beleg in ein anderes Format konvertiert, sind beide Versionen
aufzubewahren, außer die Konvertierung ist inhaltlich verlustfrei, das Ergebnis bleibt maschinell
auswertbar und der Vorgang ist in einer Verfahrensdokumentation beschrieben.

**Umsetzungsfolge:** Rechnungen (ausgestellt und empfangen) werden mindestens acht Jahre ab Ende
des Kalenderjahrs der Ausstellung revisionssicher aufbewahrt, inklusive Änderungsprotokoll für
Storno/Korrektur (siehe Abschnitt 6). Eingehende E-Rechnungen werden im Originalformat (XML bzw.
ZUGFeRD-Container) archiviert, nicht nur als Ausdruck oder Screenshot; eine zusätzliche PDF-Kopie
ist zulässig, aber nicht Ersatz für das Original. Löschroutinen (siehe Abschnitt 10) dürfen die
Acht-Jahres-Frist nicht unterschreiten.

**Quelle:** § 257 Abs. 1 Nr. 4 HGB, § 147 Abs. 3 AO; Viertes Bürokratieentlastungsgesetz
(Verkündung 18.10.2024, BGBl. 2024 I Nr. 323); BMF-Schreiben v. 11.03.2024 und v. 14.07.2025 zur
GoBD
(https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf).
**Gegenprüfen:** exakter Wortlaut der Übergangsvorschrift im EGHGB/EGAO am Gesetzestext selbst
verifizieren, hier nur aus Sekundärquellen (Haufe, Lexware) referenziert.

## 9. Zahlungsziel, Verzugszinsen-Hinweis, Geschäftsbrief-Pflichtangaben

**Regel:** Ohne vereinbartes Zahlungsziel kommt der Schuldner nach § 286 Abs. 3 BGB spätestens
30 Tage nach Fälligkeit und Zugang der Rechnung in Verzug. Gegenüber einem Verbraucher gilt diese
30-Tage-Automatik nur, wenn in der Rechnung ausdrücklich auf diese Folge hingewiesen wurde — fehlt
der Hinweis, tritt Verzug beim Verbraucher erst durch Mahnung ein. Ab Verzug gilt § 288 BGB:
5 Prozentpunkte über dem Basiszinssatz bei Verbrauchergeschäften, 9 Prozentpunkte bei
Geschäften zwischen Unternehmern.

Pflichtangaben auf Geschäftsbriefen nach § 37a HGB (Firma, Registergericht, Handelsregister-
nummer) gelten nur für im Handelsregister eingetragene Kaufleute. Für Einzelunternehmer und
Freiberufler ohne Handelsregistereintrag — der Regelfall bei Freelancern — ist § 37a HGB nicht
einschlägig; stattdessen verlangt § 2 der Dienstleistungs-Informationspflichten-Verordnung
(DL-InfoV) die Angabe des vollständigen Vor- und Zunamens sowie einer ladungsfähigen Anschrift auf
Geschäftsunterlagen.

**Umsetzungsfolge:** Rechnungsvorlage bietet ein Feld für das Zahlungsziel (Tage netto);
Standardtext bei B2C-Rechnungen ohne individuelle Zahlungsvereinbarung enthält den Hinweis auf die
30-Tage-Verzugsfolge nach § 286 Abs. 3 BGB, damit die Automatik überhaupt greift. Fußzeile der
Rechnung zeigt für Mandanten ohne Handelsregistereintrag Name und ladungsfähige Anschrift
(DL-InfoV), Handelsregisterfelder (Registergericht, HR-Nummer) sind optional und nur für
eingetragene Mandanten sichtbar.

**Quelle:** § 286 Abs. 3 BGB (https://www.gesetze-im-internet.de/bgb/__286.html), § 288 BGB
(https://www.gesetze-im-internet.de/bgb/__288.html), § 37a HGB
(https://www.gesetze-im-internet.de/hgb/__37a.html), § 2 DL-InfoV
(https://www.gesetze-im-internet.de/dl-infov/__2.html).

## 10. Datenschutz: Aufbewahrung vs. Löschanspruch

**Regel:** Nach Art. 17 Abs. 3 lit. b DSGVO besteht kein Löschanspruch der betroffenen Person,
soweit die Verarbeitung zur Erfüllung einer rechtlichen Aufbewahrungspflicht erforderlich ist. Die
handels- und steuerrechtliche Aufbewahrungspflicht für Rechnungen (acht Jahre, siehe Abschnitt 8)
geht damit einem Löschverlangen vor. In der Praxis werden die Daten in diesem Fall nicht gelöscht,
sondern in ihrer Verwendung eingeschränkt (Verarbeitungseinschränkung nach Art. 18 DSGVO): Zugriff
nur noch zu Aufbewahrungs-/Nachweiszwecken, keine aktive Weiterverarbeitung (z. B. keine
Marketingnutzung, keine Anzeige im laufenden Betrieb außerhalb von Archiv/Export).

Die zugrunde liegenden Zeitnachweise (Buchungen, aus denen die Rechnungsposition entstanden ist)
unterliegen selbst nicht automatisch derselben Aufbewahrungspflicht wie die Rechnung — sie sind
nur insoweit aufzubewahren, wie sie Bestandteil des Buchungsbelegs sind oder anderweitig
originär aufbewahrungspflichtig sind (z. B. Nachweispflichten nach Arbeitszeitrecht, siehe
rules.md). Für reine Kalkulationsgrundlagen ohne eigene Aufbewahrungspflicht gilt der normale
Löschanspruch, sobald der Zweck (Rechnungsstellung) erfüllt ist und kein anderer Aufbewahrungs-
grund mehr besteht.

**Umsetzungsfolge:** Löschfunktion für Kundendaten/Rechnungen sperrt statt löscht, solange die
Acht-Jahres-Frist läuft: Datensatz wird als "archiviert, Zugriff eingeschränkt" markiert, bleibt
aber im Export/Prüfungszugriff vorhanden. Erst nach Fristablauf ist echtes Löschen zulässig
(und dann auch angezeigt, sofern kein anderer Grund entgegensteht). Für Zeitbuchungen, die nur der
Rechnungskalkulation dienten und in keinem weiteren aufbewahrungspflichtigen Beleg aufgehen, ist
ein separater Löschpfad vorzusehen, der nicht an die Acht-Jahres-Frist der Rechnung gekoppelt ist.

**Quelle:** Art. 17 Abs. 3 lit. b DSGVO, Art. 18 DSGVO; § 257 HGB, § 147 AO (Aufbewahrungspflicht
als Rechtsgrundlage der Ausnahme).
**Gegenprüfen:** ob und in welchem Umfang die Zeitbuchungen selbst als Teil des Buchungsbelegs
gelten (und damit der Acht-Jahres-Frist unterliegen) oder als eigenständige, kürzer aufzubewahrende
Kalkulationsgrundlage zu behandeln sind — das ist mit Steuerberatung zu klären, bevor eine
Löschroutine für Zeitbuchungen gebaut wird.

## Muss in Version 1

- Pflichtangaben nach § 14 Abs. 4 UStG vollständig, inklusive Leistungszeitraum aus den
  Zeitbuchungen (Abschnitt 1).
- Kleinbetragsrechnung als reduzierte Ansicht ab ≤ 250 Euro, mit Ausschluss für Reverse-Charge-
  und innergemeinschaftliche Fälle (Abschnitt 1).
- Fortlaufende, einmalige Rechnungsnummer je Mandant/Nummernkreis (Abschnitt 2).
- Kleinunternehmerregelung als Mandantenprofil mit den beiden Umsatzgrenzen, reduzierter
  Pflichtangaben-Satz nach § 34a UStDV, Pflichthinweis auf der Rechnung, Befreiung von der
  E-Rechnungs-Ausstellungspflicht (Abschnitt 3, 7).
- Reverse-Charge-Rechnungslayout für B2B-Auslandsleistungen mit beiden USt-IdNr. und
  Pflichthinweis (Abschnitt 4).
- Steuersatz je Position (19 %/7 %/steuerfrei), Netto-Ausweis je Position, Steuerbetrag je
  Steuersatzgruppe, Bruttosumme (Abschnitt 5, vorbehaltlich Rundungsklärung).
- Unveränderbarkeit versendeter Rechnungen, Korrektur nur über Berichtigungsdokument oder
  Stornorechnung, kein In-Place-Edit, kein Begriff "Gutschrift" für Korrekturen (Abschnitt 6).
- E-Rechnungs-Empfang (XML/ZUGFeRD) und -Archivierung im Originalformat ab sofort, unabhängig
  vom eigenen Ausstellungsstatus (Abschnitt 7, 8).
- Acht-Jahres-Aufbewahrung für Rechnungen mit Änderungsprotokoll, Sperren statt Löschen innerhalb
  der Frist (Abschnitt 8, 10).
- Zahlungsziel-Feld und Verzugshinweis-Text für B2C-Rechnungen (Abschnitt 9).

## Kann später

- E-Rechnungs-Ausstellung (XRechnung/ZUGFeRD EN 16931) als aktive Ausgabeoption — Pflicht für die
  meisten Freelancer-Mandanten erst ab 01.01.2027 bzw. 01.01.2028 (Abschnitt 7).
- Automatische Berechnung, ab wann ein Mandant wegen Vorjahresumsatz > 800.000 Euro
  ausstellungspflichtig wird.
- Zusammenfassende Meldung (§ 18a UStG) als eigene Funktion — bis dahin reiner Hinweistext
  (Abschnitt 4).
- Separater Löschpfad für Zeitbuchungen ohne eigene Aufbewahrungspflicht, getrennt von der
  Rechnungs-Aufbewahrung (Abschnitt 10) — abhängig vom offenen Punkt zur Einordnung der
  Zeitbuchungen.
- Verzugszins-Berechnung/-Mahnwesen auf Basis § 288 BGB.

## Offene Punkte zum Gegenprüfen mit Steuerberatung

1. Rundung von Steuerbeträgen: je Rechnungsposition oder erst auf den Gesamtbetrag — keine
   eindeutige Primärquelle gefunden, UStAE Abschn. 14.5 zum Rechercheseitpunkt nicht abrufbar
   (Abschnitt 5).
2. E-Rechnung: genaue Abgrenzung der zulässigen ZUGFeRD-Profile (insbesondere BASIC vs.
   BASIC-WL) direkt am BMF-Schreiben vom 15.10.2024/15.10.2025 verifizieren, nicht nur an
   Sekundärquellen (Abschnitt 7).
3. Übergangsvorschrift zur verkürzten Acht-Jahres-Aufbewahrungsfrist (EGHGB/EGAO) am
   Gesetzestext selbst nachvollziehen, bisher nur aus Sekundärquellen referenziert (Abschnitt 8).
4. Einordnung der Zeitbuchungen als Bestandteil des aufbewahrungspflichtigen Buchungsbelegs oder
   als eigenständige, kürzer aufzubewahrende Kalkulationsgrundlage — entscheidet, ob für
   Zeitbuchungen ein eigener, kürzerer Löschzyklus zulässig ist (Abschnitt 10).
5. Genaue Betragsgrenze und deren letzte Änderung bei der Kleinbetragsrechnung im historischen
   Kontext (aktuelle 250-Euro-Grenze ist über § 33 UStDV gesichert, das Datum der letzten Anhebung
   wurde hier nicht separat mit Primärquelle verifiziert) (Abschnitt 1).
6. Ob und wie die Kleinunternehmer-Umsatzgrenze (25.000/100.000 Euro) auf Basis von Ist- oder
   Soll-Versteuerung und auf Brutto- oder Nettobasis zu ermitteln ist, wenn der Mandant unterjährig
   von Kleinunternehmer- in Regelbesteuerung wechselt (Abschnitt 3).
