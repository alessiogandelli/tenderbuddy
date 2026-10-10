# Tender analysis — BKP_244_LV_Lueftung_260804.pdf

_Pattern analysis for extraction prompts. Generated 2026-10-10 with `gpt-6.1-sol` (effort `medium`). 202 pages, 312018 chars. Deterministic LV-ish pages: 121._


## Document parts

| Part | Pages | Kind | Notes |
|---|---|---|---|
| Tender cover and bidder identification | 1 | `cover` | Project 'PEO_Neubau Primarschule Erlenstrasse, Oberglatt', tender 'Ausschreibung und Angebot Nr. 24400', trade 'BKP 244 Lüftungsanlagen'. Offer amount, contact and signature fields are not BOQ positions. |
| Offer totals and commercial conditions | 2 | `modulo_offerta` | 'Zusammenstellung nach Auftrag, BKP: Hochbau, NPK-Kapitel' and 'Konditionen': gross/net totals, discounts, deductions and VAT. 'ohne NPK' means standard NPK item numbering must not be assumed. |
| KOSTENZUSAMMENSTELLUNG LÜFTUNG | 3 | `modulo_offerta` | LOS 1/LOS 2 cost-summary matrix with installation headings 244.1–244.6. These are installation totals, not detail positions. |
| Supplementary unit-price schedules | 4–6 | `preziario` | 'MEHR-/ MINDERPREISE' / 'EINHEITSPREISE LÜFTUNG / KLIMA'. Requested unit rates without tender quantities; separate from the main BOQ. |
| Contents and acceptance signature | 7 | `index` | Lists sections 1–9, including '8 Leistungsverzeichnis'. |
| Procurement procedure and award criteria | 8–9 | `legal` | Participation, award criteria, submission and payment terms. Scoring percentages are not pricing positions. |
| Besondere Bedingungen Anderegg Partner AG | 10–17 | `legal` | General contractual conditions, guarantees, deductions, daywork and possible lump-sum contracts. Contract clauses do not constitute individual BOQ positions. |
| Objektbezogene Bedingungen und Informationen | 18–22 | `legal` | Project conditions, including delay, materials and invoicing. Page 21 is contractual prose, notwithstanding its LV/table detector flags. |
| Bedingungen und Informationen Fachplaner — divider | 23 | `legal` | Incorporates specialist conditions into the tender and contract. |
| Specialist conditions and technical specifications | 24–47 | `specifications` | Design data, responsibilities, obligations, third-party scope and technical requirements. Engineering and responsibility tables are not pricing rows. |
| Abzuliefernde Unterlagen / Berechnungsgrundlagen Kosten | 48–49 | `modulo_offerta` | Ancillary daywork occupation rates, flat charge per visit, discounts and overtime surcharges. No numbered LV positions, tender quantities or line totals. |
| Berechnungsgrundlagen Technik | 50–51 | `specifications` | Climate, acoustic tolerances, temperatures, capacities and operating pressures. |
| 4.2 Berichte | 52 | `legal` | Incorporates project reports into the tender and contract. |
| Qualitätsmanagement | 53–54 | `legal` | Quality-assurance obligations. Costs are included in unit prices unless the LV provides specific positions; do not synthesize a separate item. |
| Deklarationen | 55–63 | `legal` | Eligibility, references, insurance, staffing, declarations and signatures. CHF and staffing-percentage fields are not construction pricing positions. |
| Termine — divider and construction programme | 64–65 | `other` | Page 65 has 'Nr. | Vorgangsname', 'Dauer |' and 'Anfang |'. Its 262 detected codes concern programme data, not BOQ positions. |
| Leistungsverzeichnis divider | 66 | `captions` | '8 Leistungsverzeichnis.docx'. The main LV starts on page 67; the divider is not priceable. |
| 244.01 LA01 Nebenräume | 67–88 | `lv` | A apparatus: 67–73; B ducts: 74–77, including NOVA lists 75–76; C fittings/instruments: 78–81; D controls/field devices: 82–83; E installation/services: 84; F insulation: 85–87. Page 88 is the cost recap. Main equipment quantities are not visible in the supplied analysis. |
| 244.02 LA02 Essenräume EG | 89–118 | `lv` | A apparatus: 89–97; B ducts: 98–104, including NOVA lists 99–101; C fittings/instruments: 105–109; D field devices: 110–111; E installation/services: 112; F insulation/fire protection: 113–117. Page 118 is the cost recap. Local pagination runs 1/27–27/27, excluding inserted NOVA pages. |
| 244.03 LA03 Küche/Abwaschen | 119–146 | `lv` | A apparatus: 119–129; B ducts: 130–133, including NOVA lists 131–132; C fittings/instruments: 134–138; D field devices: 139–140; E installation/services: 141; F insulation/fire protection: 142–145. Page 146 is the cost recap. Pages 128 and 138 are header-only. |
| 244.04 Schulzimmer OG | 147–173 | `lv` | A apparatus: 147–154; B ducts: 155–159, including NOVA lists 156–158; C fittings/instruments: 160–165; D field devices: 166–167; E installation/services: 168; F insulation/fire protection: 169–172. Page 173 is the cost recap. |
| 244.05 LA05 Turnhalle | 174–195 | `lv` | A apparatus: 174–180; B ducts: 181–184, including NOVA lists 182–183; C fittings/instruments: 185–190; D field devices: 191–192; E installation/services: 193; F insulation: 194. Page 195 is the cost recap. Pages 181–195 have conflicting copied system labels; opening title, file path and continuous pagination identify Turnhalle. |
| 244.06 Montagesystem Flachdach — general description | 196 | `specifications` | General mounting-system description and scope, including transport, installation and waste. Not an independent quantity schedule. |
| 244.06 Montagesystem Flachdach — items, services and recap | 197–199 | `lv` | Page 197: section C, mounting feet 150 Stk and mounting rails 500 m, with included accessories. Page 198: section E, amount-only installation and technical-services packages. Sections marked 'Entfällt' are excluded. Page 199 is the cost recap. |
| Plan lists | 200–202 | `index` | Architectural and ventilation drawing references, dates, scales and sheet sizes; no construction pricing positions. |

## Priceable sections (LV / preziario / modulo offerta)

### Supplementary ductwork and pipework unit rates — pages 4

**Layout.** Blank dimension matrices for Kanäle, Bogen and Konen/Etagen, each with 30 price blanks. Flattened text does not reliably preserve matrix-cell associations. Spirorohre has diameter and component variants.

**Position numbers.** `Section labels '2.1' and '1.'; no unique item codes.`

**Columns.** Component type, Dimension or dimension pair, Requested unit rate, brutto, exkl. MWST

**Units seen.** m, Stk., lfm, Preis pro 1 m pro Stk.

### Supplementary fittings unit rates — pages 5

**Layout.** Circular/rectangular dimension and type variants, manufacturer/type entry fields and per-piece rate blanks.

**Position numbers.** `Section label '2.'; no unique item codes.`

**Columns.** Component description, Connection dimension, Fabrikat, Typ, Unit rate per Stk.

**Units seen.** Stk.

### Supplementary insulation unit rates — pages 6

**Layout.** Seven description/rate rows under 'Preis pro m2'; CHF price blanks, no quantities.

**Position numbers.** `Section label '3.'; no unique item codes.`

**Columns.** Insulation description, Unit rate in CHF per m2

**Units seen.** m2

### Ancillary daywork and commercial rate fields — pages 48–49

**Layout.** Parallel occupation/hourly-rate lists, a flat charge per visit, discount fields and four hourly-rate surcharge fields. Not the main measured LV.

**Position numbers.** `Document headings such as '4.1.4', not item numbers.`

**Columns.** Occupation or rate basis, CHF rate field or percentage field

**Units seen.** Brutto-Stundenlöhnen, Pauschale pro Besuch, Std.

### 244.01 LA01 Nebenräume — A–F — pages 67–88

**Layout.** Repeated six-column LV with multi-page apparatus descriptions, variants, measured accessories, field-device scope groups, service packages and insulation. NOVA lists on 75–76 use separate engineering headers. Page 88 is a recap.

**Position numbers.** `System '244.01', section letters A–F and equipment tags '1-1'/'1-2'; no demonstrated continuous row-level item numbers.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, Stk., m2, Tage

### 244.02 LA02 Essenräume EG — A–F — pages 89–118

**Layout.** Same six-column form. Complete supply apparatus spans 89–94, exhaust apparatus 95–97. Embedded material lists 99–101, technical variant subtables and service packages. Pages 109, 111 and 117 primarily close sections; 118 is the recap.

**Position numbers.** `System '244.02', section letters A–F, tags 'Zuluftgerät 2-1' and 'Fortluft 2-2'; ordinary items generally unnumbered.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, Stk., m2, Tage

### 244.03 LA03 Küche/Abwaschen — A–F — pages 119–146

**Layout.** Six-column form with multi-page apparatus, NOVA lists 131–132, variant tables, measured length/area/hourly items and section-E packages. Header-only and subtotal-only pages occur. Page 146 is the recap.

**Position numbers.** `System '244.03'/'244.3', A–F, equipment tags '3-1'/'3-2'; no regular numbered item sequence.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, Stk., m, m2, Std.

### 244.04 Schulzimmer OG — A–F — pages 147–173

**Layout.** Six-column form, apparatus continuations and ambiguous parent/component pricing boundaries; NOVA lists 156–158; multi-size instruments, field devices, packages and insulation. Page 172 is legend/total content; 173 is the recap.

**Position numbers.** `System '244.04'/'244.4', A–F, tags '4-1'/'4-2'; most measured items have no printed number.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, Stk., m2, Tage

### 244.05 LA05 Turnhalle — A–F — pages 174–195

**Layout.** Six-column form with long apparatus descriptions, NOVA lists 182–183, technical variants, field devices and service packages. Page 195 is the recap. Copied headers conflict with the actual system.

**Position numbers.** `System '244.05'/'244.5', A–F, equipment tags '5-1'/'5-2'; no independent numeric item sequence.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, Stk., m2, Tage

### NOVA material schedules — LA01 — pages 75–76

**Layout.** Incorporated section-B engineering quantity schedules without monetary columns; separate duct, rectangular fitting, pipe and round-fitting headers.

**Position numbers.** `Recurring KZ component classes, not unique item identifiers.`

**Columns.** l or Stk, KZ, Bezeichnung, a / b / d or d1 / d2 / d3, w, Bemerkung

**Units seen.** mm, Stk, °

### NOVA material schedules — LA02 — pages 99–101

**Layout.** Quantity-first engineering schedules incorporated into section B; local headers change by component family.

**Position numbers.** `Recurring KZ classes such as L, LT, R-R, BA, BS, UA, BGE and MFA.`

**Columns.** l or Stk, KZ, Bezeichnung, Dimensions according to local header, w, Bemerkung

**Units seen.** mm, Stk, °

### NOVA material schedules — LA03 — pages 131–132

**Layout.** Supporting section-B quantity tables without price columns; flattened optional dimension cells can be ambiguous.

**Position numbers.** `Recurring KZ classes, not source position numbers.`

**Columns.** l or Stk, KZ, Bezeichnung, Dimensions according to local header, w, Bemerkung

**Units seen.** mm, Stk, °

### NOVA material schedules — LA04 — pages 156–158

**Layout.** Rectangular ducts and fittings followed by round pipes/fittings; quantity-first, no monetary columns.

**Position numbers.** `Recurring KZ classes including L, LT, BA, BO, BS, HS, RA, SO, SR, TG, UA, US, R-R, ATE, BGE, MFA and USE.`

**Columns.** l or Stk, KZ, Bezeichnung, Dimensions according to local header, w, Bemerkung

**Units seen.** mm, Stk, °

### NOVA material schedules — LA05 — pages 182–183

**Layout.** Quantity-first duct, fitting and pipe schedules incorporated into section B, without price or amount columns.

**Position numbers.** `Recurring KZ classes, not unique positions.`

**Columns.** l or Stk, KZ, Bezeichnung, Dimensions according to local header, w, Bemerkung

**Units seen.** mm, Stk, °

### 244.06 Montagesystem Flachdach — C and E — pages 197–198

**Layout.** Standard six-column form. Section C has two quantity rows and included accessories; E has amount-only service packages.

**Position numbers.** `System '244.06' and section letters; no visible item-level numbering.`

**Columns.** Pos., Gegenstand, Mass-Gattg., Mass-betrag, Einheits-Preis, Betrag Fr.

**Units seen.** Stk, m, Tage


## Position patterns

- Installation cost-summary identifier, not a detail item — 244.1 LA01 Nebenräume UG — Page 3: retain installation/lot summary context separately. Do not reuse 244.1–244.6 as detail-item codes or double-count summary totals.
- Supplementary pipe diameter/type variants — Spirorohre
Preis pro lfm bzw. pro Stück — Page 4: inherit the family for diameters 12.5, 20, 31.5 and 40 under Ø (cm). Separate Rohre in m from Bogen 90° in pc; quantities and unfilled prices remain null.
- Supplementary fitting variants — Volumenstromregler, inkl. Montage, doppelwandig, inkl. 1 Schalldämpfer 1m — Page 5: inherit scope into circular/rectangular and variable/constant variants. Each requests a per-piece rate. Included component counts and lengths are not tender quantities.
- Supplementary fire-damper variants — Brandschutzklappen EI90, inkl. 2 Manschetten, Antrieb (Typ gemäss LV) — Page 5: create dimension variants, inheriting EI90, collars and actuator. Manufacturer/type blanks are bidder-entry metadata.
- Supplementary shared-unit insulation row — Aussendämmung 100 mm
CHF  ................
Inkl. Verblechung (ALU Stucco) — Page 6: inherit Preis pro m2 and common installation requirements. Attach cladding text to this row; distinguish all seven rate requests.
- Two-dimensional supplementary rate matrix — Konen/Etagen
Preis pro 1 m pro Stk. — Page 4: preserve both dimension axes and the complete pricing basis. Recover layout coordinates before assigning the 30 blanks to dimension pairs.
- Ancillary occupation rates — Allfällige Regiearbeiten, welche von der Bauleitung angeordnet werden, werden zu folgenden
Brutto-Stundenlöhnen inkl. Zulagen verrechnet: — Page 48: extract occupation/hourly-rate fields only into a separate ancillary schedule. Parallel columns are flattened; do not assume successive lines pair correctly.
- Document heading resembling a position — 4.1.4 Zuschläge für Überzeitarbeiten auf die Stunden-Ansätze — Treat as a document heading and rate-schedule context, not a source item number.
- Technical dimension table, not an item — bis
250 mm ø
0,6 mm
bis
500 mm ø
0,8 mm
über
600 mm ø
1,0 mm — Page 43: cladding-thickness specification by diameter; exclude from pricing rows.
- Unnumbered apparatus with missing quantity — Page 67: "Zuluftgerät 1-1" followed by "Stk"; page 71: "Fortluft 1-2" followed by "Stk". — Preserve equipment tags and unit; keep main quantity null. Carry specifications across headers and pages; component counts do not establish package quantity.
- Complete multi-page apparatus with explicit quantity — Zuluftgerät 2-1
Stk
1 ... bestehend aus: ... Zuluftgerät komplett — Pages 89–94: one supply package, 1 pc. Closure text is not another item. Component measure pairs require parent/component review before independent pricing.
- Apparatus heading without visible measure pair — Fortluft 3-2 — Page 125: retain an apparatus candidate with unresolved quantity rather than copying quantities from accessories or other systems.
- Independent measured testing row — Page 77: "Kanaldichtheitsprüfung" ... "Stk" ... "2". — Collect testing scope and extract 2 pc. Stop before the section total. Keep testing rows from different systems/subsections separate.
- Shared-description dimensional variants — Page 78: "Zuluft - Tellerventil" ... "Grösse" ... "Ø 10 cm" ... "Stk" ... "5" ... "Ø 12.5 cm" ... "Stk" ... "6". — Emit one row per size/quantity pair, inheriting common manufacturer, type, material and finish requirements.
- Separately measured accessory and finish — Page 78: "Sockelrohr V2A" ... "Stk" ... "1"; "Farbbeschichtung nach NCS" / "exkl. Sonderfarbzuschlag" ... "Stk" ... "1". — Keep separately quantified add-ons distinct, with parent-product context; identical finish wording does not justify merging rows.
- Inherited description with modified variant — Page 81: "Kontroll- und Putzdeckel" ... "40 x 20 cm" ... "Stk" ... "4"; "wie vorbeschrieben, jedoch für isolierte Rohre" ... "10 Ø cm" ... "Stk" ... "2". — Resolve the inherited description and apply the changed insulated-pipe scope, size and quantity.
- Quantity preceding extended specification — Drehantrieb, 20 Nm,

Stk.
2
AC/DC 24 V, Auf/Zu, 3-Punkt, 150 s, IP54 — Read beyond the 2 pc measure pair until the next independent heading. This pattern recurs in field-device sections.
- Installation-only field devices — Page 82: "Einbau der folgenden Feldgeräte in die Installation." followed by "Druckwächter" / "Stk." / "4", "Frostschutzwächter, 2-Punkt" / "Stk" / "1", "Kanaltemperaturfühler" / "Stk" / "6", and "Druckdifferenzfühler" / "Stk" / "2". — Emit separate device rows with installation-only scope; do not infer device supply.
- Description continuing after quantity — Ø 250 mm, Rohr, Länge 3m (L132503502)
Stk
16 — Page 103: quantity is 16 pc; 3 m is each piece's length, not a measured total of 48 m. Keep following explanatory text attached.
- Technical variant table ending in measure pair — BM0
50x30
1217
3100
500
Stk
4 — Page 106: use Mod., DN, Vmin., Vmax. and δP headers. Extract 4 pc; other numbers are model/dimension/performance attributes.
- Silencer family variants — 100
10
28.5x20.5
27
Stk
6
50
10
28.5x20.5
27
Stk
4 — Page 107: two Kompaktschalldämpfer variants, quantities 6 and 4. Leading values are technical dimensions, not quantities.
- Unnumbered measured insulation row — Thermische Aussendämmung 30/5

aus 30 mm Mineralwollmatten ( = 80 kg/m3)
mit Alu-Folie, gestiftet
m2
32 — Page 142: extract 32 m2 with the title/specification and system/section context; source item number remains empty.
- Cross-page firestop variants — Kanalverstärkungs-Verbundprofil 110x26mm und Itumeszierendes Rundporfil 16-39mm EI30 ... 500 x 350 ... Stk ... 6 — Pages 113–114: carry wall-penetration context into size variants. Keep later ceiling-penetration families separate.
- Cross-page controller variants — TVR-D
12.5
60
200
150

Stk
10
TVR-D
16
120
400
150

Stk
6 — Page 164: inherit the controller description from 163. Apply local technical headers; extract all three variants with quantities 10, 6 and 12.
- Apparatus component with explicit measure pair — 1 Luftkühler-/Lufterhitzerteil (Change-Over-Batterie)

Stk.
1 — Page 151: retain a measured component candidate under Zuluftgerät 4-1. A measure pair alone does not prove separate pricing; avoid cumulative parent/component costs without price-cell evidence.
- Cross-page component continuation — Druckverlust
13
Pa
Stk
1 — Page 153: completes the Schalldämpferteil begun on 152; do not create an item named Druckverlust.
- Supporting material-list length — 12540 R-R
Wickelfalzrohr
100 Einlage — Page 99: under l/mm, normalize 12540 mm to 12.54 m. Diameter 100 mm and Einlage are attributes. Mark as supporting material scope without invented monetary columns.
- Supporting material-list fitting count — 4 BGE
Bogen
100
45 Einlage — Page 99: 4 pc, diameter 100 mm, angle 45°, remark Einlage. KZ is a component class, not a unique position.
- Supporting rectangular duct length — 9315 L
Luftleitung
150
750 — Page 156: 9315 mm becomes 9.315 m; 150 by 750 mm are dimensions. Keep as section-B material-schedule record.
- Turnhalle technical controller variants — Page 187: 'Mod. DN V P' with 'VFC 10 40-100 50.' / 'Stk 12', followed by 'VFC 16 200 50.' / 'Stk 1', 'VFC 20 400 50.' / 'Stk 2', and 'VFC 20 500 50.' / 'Stk 2'. — Emit four inherited constant-volume-controller variants. The rightmost piece counts are quantities; 50. is pressure, not price.
- Unit-bearing item with missing quantity — Page 169: 'Thermische Aussendämmung 100/15' ... 'm2' with no following quantity. — Retain an incomplete item candidate with null quantity; do not borrow quantities from adjacent insulation rows.
- Flat-roof explicit quantity items — Page 194: 'Kanal-Aussendämmung' ... 'm2' / '10'. Page 197: 'Montagefüsse z.B.' / 'Stk' / '150'. — Extract independent quantity rows with their local hierarchy and full specifications. Preserve z.B. as an example qualification.


## Lump-sum / "una tantum" positions

- Ancillary flat charge per visit — 48 — Pauschale pro
Besuch
CHF
 ............ — Keep outside the main LV as a per-visit flat-charge rate. LS classification must retain 'per visit'; quantity and price are unknown, not a project-wide quantity 1.
- LA01 installation/transport service package — 84 — 'Montage und Transport', comprehensive service scope, 'Stk' / '1' and a dotted price field. — One package-priced service item, source Stk 1 normalized pc. Package/LS character is semantic, not an explicit LS unit. Retain continuing handover, warranty and documentation scope; exclude the duplicate total.
- LA01 technical services package — 84 — 'Dienstleistungen', 'Technische Bearbeitung gemäss', '7.1 Schnittstelle Dienstleistungen', '7.2 Leistungen des Unternehmers', and 'Total Dienstleistungen' with a dotted field. — One amount-only package candidate; source unit and quantity null. LS is inferred. The direct scope total is its pricing field, not another aggregate item.
- Static calculation for buried ducts — 104 — 'Statische Berechnung (223001)' and 'Stk' / '1'. — Separate one-off service, 1 pc. Package-like but not explicitly a lump-sum unit.
- Shipping, packaging and handling — 104 — 'VERSANDKOSTEN - Fracht, Verpackung & Handling' and 'Stk' / '1'. — Separate one-off charge, 1 pc; neither a pipe quantity nor a percentage surcharge.
- LA02 installation/transport service package — 112 — Comprehensive 'Montage und Transport' wording with 'Stk' / '1' and 'Total Montage und Transport'. — One package-priced item with explicit source unit pc and quantity 1. Do not separately price included warranty service, plans or its total.
- LA02 technical services package — 112 — 'Total Dienstleistungen' is the visible pricing field for technical-services scope. — Retain one amount-only package, with null source unit/quantity and inferred LS classification; exclude the overall E total.
- LA03 installation/transport service package — 141 — 'Montage und Transport', comprehensive scope, 'Stk 1' and a dotted field. — One bundled item, 1 pc; retain handover, guarantee and documentation scope. LS-equivalent character does not replace the explicit unit.
- LA03 technical services package — 141 — 'Dienstleistungen', references 7.1/7.2, and 'Total Dienstleistungen' with a dotted amount field. — One amount-only package candidate with source unit/quantity null. References are specification sections, not item numbers.
- LA04 installation/transport package — 168 — 'Montage und Transport' followed by 'Stk' / '1' and an amount placeholder. — Extract one explicit 1 pc package; do not duplicate its total.
- LA04 field-device installation, handover and hygiene package — 168 — 'Einbau der bauseits gelieferten Feldgeräte gemäss Ausschreibung BKP 237.0 Gebäudeautomation', hygiene scope and a separate 'Stk' / '1'. — Extract the second explicit package separately. Preserve 1 pc and flag ambiguous allocation of subsequent warranty/documentation text.
- LA04 technical services package — 168 — 'Dienstleistungen', references 3.6.1/3.6.2 and 'Total Dienstleistungen' with an amount placeholder. — One amount-only service package, inferred LS, source quantity/unit null.
- Turnhalle duct leakage testing package — 184 — 'Kanaldichtheitsprüfung' with bundled testing/documentation scope and 'Stk' / '1'. — One testing item, 1 pc. Package-like scope does not make the source unit LS; do not split its requirements.
- Turnhalle installation/transport and hygiene packages — 193 — Two separate 'Stk' / '1' pairs within service scope. — Extract two explicitly quantified packages, each 1 pc. Preserve the 8.00m installation-height requirement and flag ambiguous trailing-scope allocation.
- Turnhalle technical services package — 193 — 'Total Dienstleistungen' with a direct service-scope amount field. — One amount-only package with inferred LS character and null source unit/quantity; exclude overall section totals.
- Flat-roof mounting-system installation/transport — 198 — 'Montage und Transport' followed by 'Total Montage und Transport' and an amount placeholder, without unit or quantity. — One amount-only service package. LS is inferred; source quantity/unit remain null. Flag possible overlap with page 196's inclusion statement.
- Flat-roof mounting-system technical services — 198 — 'Dienstleistungen', 'Technische Bearbeitung gemäss' and 'Total Dienstleistungen' with an amount placeholder. — One amount-only package, inferred LS; do not extract the overall E total or infer a percentage.


## Percentage positions

- Offer discounts, deductions and VAT — commercial metadata — 2 — Sequence: Brutto, Rabatt, Zwischentotal 1, Skonto, Zwischentotal 2, allg. Bauabzüge, Zwischentotal 3, MWST, Netto. General deductions '1.30  %'; VAT '8.10  %'; discount fields blank. — Store outside the item list and respect the displayed subtotal sequence. Do not invent position references or ordinary percentage BOQ rows.
- Guarantee percentage — contractual security — 13 — 'Die Höhe der Garantiesumme wird in jedem Fall auf 10 % der Gesamtabrechnungssumme festgelegt.' — Exclude from chargeable BOQ positions; retain as guarantee metadata.
- General contractual deduction — 17 — 'Der Kostenanteil des Unternehmers beträgt 1,3 % der Abrechnungssumme.' — Contractual explanation of page 2's deduction, not a second charge.
- Daywork material discounts — 49 — 'Auf Material' under 'Konditionen auf Regiearbeiten', with '.... % Rabatt' and '.... % Skonto'. — Separate ancillary commercial fields; leave rates null and distinguish Rabatt from Skonto.
- Daywork labour discounts — 49 — 'Auf Löhne' under 'Konditionen auf Regiearbeiten', with '.... % Rabatt' and '.... % Skonto'. — Separate ancillary fields with labour basis, null rates and no invented LV reference.
- Overtime, night, Saturday and Sunday/public-holiday surcharges — 49 — 'Zuschläge für Überzeitarbeiten auf die Stunden-Ansätze'; underlying hourly rates. — Retain four ancillary percentage fields for 'Überzeit Montag-Freitag', 'Nachtarbeit von 20.00 - 06.00 Uhr', 'Samstagsarbeit' and 'Sonn- und Feiertagsarbeiten'. Preserve 'per Std. .... %', time windows and null rates. No actual percentage-priced main-LV position is established.


## Unit vocabulary

- Stk / Stk. — pc — Main LV, supplementary rates and fitting counts. Included technical counts do not automatically define independent items. Stk 1 service packages retain pc even when economically package-priced.
- m — m — Measured linear quantities and supplementary rates. Descriptive lengths, dimensions and installation heights are not quantities.
- lfm — m — Supplementary linear pipe-rate basis.
- Preis pro 1 m pro Stk. — pc — Qualified Konen/Etagen per-piece basis. Preserve complete wording and the 1 m qualification.
- m2 / m² — m2 — Measured area only when used as the pricing/measurement unit. Filter areas and free cross-sections are technical attributes.
- Brutto-Stundenlöhnen / Std. — h — Ancillary hourly rates and actual hourly LV rows. Page 135 includes Service- und Montagearbeitsstunde 176 and Einregulierung 21.
- l with mm header — m — NOVA length quantity: divide by 1000. Lowercase l denotes length, not litres. Dimension columns remain descriptive mm values.
- Pauschale pro
Besuch — LS — Ancillary flat charge with mandatory per-visit qualifier; not a project-wide lump sum.
- No stated unit; amount-only service package — LS — Inferred classification only where a separately identifiable service scope has its own amount field. Preserve null source unit and quantity.
- Tage — Tage — Unfilled installation-duration declaration, not a priced labour quantity. No hours-per-day conversion is supplied; do not map to h.
- m3/h — m3/h — Technical airflow, not an evidenced pricing unit. Likewise treat Pa, dBA, kW, °C, bar and engineering percentages as attributes unless an actual measurement column establishes otherwise.


## Extraction rules

- Use outer '=== PAGE n ===' tags as global source pages. Printed pagination restarts by document/system and is interrupted by inserted NOVA sheets; preserve it separately.
- The partial analyses collectively cover pages 1–202. Excerpt-specific claims that other pages were unavailable are superseded by the complementary analyses; do not retain those as full-tender limitations.
- Separate supplementary rate requests on 4–6, ancillary commercial/daywork fields on 48–49, main LV scope on 67–199, and summaries/conditions. The first supplementary priceable detail is on page 4; the main LV begins on page 67 after the page 66 divider.
- Reconstruct the main header as Pos. | Gegenstand | Mass-Gattg. | Mass-betrag | Einheits-Preis | Betrag Fr. Mass-betrag is quantity, not monetary amount.
- Track system, section letter, shared description and parent equipment across pages. Systems span LA01 67–88, LA02 89–118, LA03 119–146, LA04 147–173, LA05 174–195, and roof mounting 196–199.
- Most row-level source item numbers are absent. Do not use system codes, equipment tags, section references, manufacturer codes or KZ classes as unique printed item numbers. Generated internal keys must be explicitly synthetic.
- Remove repeated project names, paths, dates, table labels and page footers without terminating descriptions continued across pages.
- Identify independent measured rows through compatible descriptions and local measure cells. Units include Stk, Stk., m, m2 and Std.; quantity may occur before the rest of the specification.
- Preserve missing quantities, rates and amounts as null. Never default blank fields to zero or equipment/rate-request quantities to one.
- For supplementary rate schedules, inherit family/type/dimension context and pricing units. Keep quantities null; do not invent source codes. Preserve brutto/exkl. MWST and installation-height conditions.
- Recover original layout for page 4 matrices before assigning dimension pairs to rate cells. Flattened sequences do not establish matrix-cell order.
- Emit one row per explicit size/model variant, inheriting common descriptions and local technical-column labels. Keep airflow, pressure, attenuation and dimensions as attributes.
- Keep independently measured accessories, finishes and mounting frames separate while retaining parent context. Do not merge repeated descriptions across systems, locations or scope blocks.
- Maintain apparatus parent/component structure. Leading counts under 'bestehend aus:' or 'Zubehör:' are generally included contents. Even explicit component measure pairs inside a package require pricing-boundary review before treating them as independently priced.
- Do not cumulatively price a complete apparatus and all its components without evidence of separate pricing cells. Preserve ambiguous measured components as linked review candidates.
- Include NOVA lists on 75–76, 99–101, 131–132, 156–158 and 182–183 as incorporated section-B material quantities. Distinguish these supporting records from independently evidenced price-cell rows; do not manufacture monetary columns.
- Parse each NOVA subsection with its own header: l/mm means leading length divided by 1000 to metres; Stk means leading piece count. Preserve dimensions, angles, optional blanks and remarks such as Einlage.
- Keep distinct testing rows separate, including page 102 quantity 2 and page 104 quantity 8. Shared descriptions do not establish duplicates.
- Exclude aggregate section totals and cost recaps on 88, 118, 146, 173, 195 and 199. Exception: a direct amount-only service scope may use its own Total Montage und Transport or Total Dienstleistungen as its sole price field.
- For Stk 1 packages retain pc and quantity 1; record package/LS-equivalent character separately. Amount-only packages retain null source unit/quantity and explicitly inferred LS classification.
- On pages 168 and 193 distinguish the two explicit service-package quantity pairs from the separate amount-only technical-services package. Flag ambiguous allocation of trailing warranty/documentation scope.
- Exclude Montagezeit / 2 Mann / Tage declarations from priceable labour rows. Dots also occur in manufacturer, type, acoustic and duration fields; dotted text alone is not pricing evidence.
- The separately tendered Steuerung und Regulierung exclusion does not remove subsequent field-device rows. Preserve Lieferung und Einbau versus installation-only Einbau scope.
- Retain pages 181–195 under Turnhalle based on opening title, continuous pagination and 244.05 file path; preserve conflicting copied headers and recap labels as warnings.
- Exclude sections explicitly marked Entfällt, but flag the Turnhalle recap's conflicting D exclusion rather than deleting its measured field-device rows.
- Keep commercial percentages outside ordinary BOQ rows. Technical efficiencies, humidity, glycol content, filter ratings and sensor thresholds are not percentage-price positions. No percentage-priced main-LV position is evidenced.
- Contractual inclusion clauses do not create new items. Attach them to matching existing scope; flag potential overlap between roof-system included installation on 196 and explicit service pricing on 198.
- Preserve source wording, misspellings and anomalous technical values; do not silently repair uncertain dimensions or numeric fields.
- Exclude programme tasks, responsibility matrices, declarations, technical-only tables, plan references and pages 200–202 from detail-position extraction.


## Gotchas

- Page-map flags and hit counts are not authoritative item evidence: page 21 is a false LV positive; page 65 programme codes and page 201 plan numbers mimic item codes.
- Pages without standard headers can contain essential incorporated quantities. All five NOVA material-list groups are marked non-LV by the detector.
- Conversely, header-only, total-only and recap pages do not contain new positions merely because a table header is detected.
- The Pos. column exists, but ordinary items are predominantly unnumbered. 244.01–244.06 are systems, not item IDs.
- Main apparatus quantities may be absent even when Stk is visible. Equipment tags and component counts do not establish quantity 1.
- Inside complete apparatus packages, component Stk pairs can be pricing-ambiguous. Preserve parent relationships and review rather than double-counting.
- Silencer internal counts such as Anzahl Kulissen 21Stk are specifications; the final main-table Stk count is the ordered quantity.
- NOVA lengths are in mm. Misreading 33860 as metres or pieces creates a major quantity error. Local engineering headers override nearby duct prose using cm.
- NOVA optional dimension cells are flattened; do not shift values or invent missing alignment. The incomplete-looking BSK/frame entry on page 132 needs review.
- Page 155's stated material-list coverage 'Seiten 1-10' conflicts with visible takeoff pagination '2 / 8', '3 / 8' and '4 / 8'; do not assume every referenced sheet is present.
- Page 3's A–F summary headings and page 48's parallel occupation lists lose spatial relationships in flattened text.
- Included counts such as 1 Schalldämpfer 1m, 2 Manschetten or 8 Stück pro Durchführung are scope attributes, not automatically ordered quantities.
- Page 169 has two Thermische Aussendämmung 100/15 blocks: one lacks quantity, while the V2A-clad version has 440 m2. Do not merge or transfer quantities.
- Page 135's Ausführungszeichnung Deckenspiegel / REVEN / IBN / Meetings text has no clear measure pair; do not borrow the neighbouring Std. 21.
- The controller group-total/commissioning text on page 164 is not a separate lump-sum position.
- Turnhalle pages 181–195 reuse LA03 headers; page 195 also has 'Total 244.01 Lüftungsanlage Turnhalle' and says D entfällt despite field-device quantities on 191.
- Stk 1 is not literally LS. Amount-only package LS treatment is inferred, not a quoted source unit.
- The legal references to Pauschale on 17 and Einheits-, Global- oder Pauschalpreisen on 48 do not establish project-wide lump-sum items.
- Page 196 includes transport, installation and waste in roof-system scope while page 198 offers separate service amount fields; flag inclusion overlap rather than deleting either source statement.
- The flat-roof document is dated 19.04.2024 while surrounding systems are dated 2026; preserve this version warning.
- Source anomalies include 'Grösse Ø 1155 cm', 'Wirkdruck Messdüse 129 kW' and 'Nennstrom 9.2.3 A'. Preserve and flag them, not reinterpret them as item codes.
- Percentages in discounts, VAT, guarantees, award scoring, staffing and technical performance have different bases and must not be conflated with percentage-priced work.
- Blank price requests must not contribute invented amounts to totals. CHF/Fr. is currency, not a measurement unit.


---

Analysis usage: {"model": "gpt-6.1-sol", "effort": "medium", "calls": 7, "input_tokens": 204993, "output_tokens": 39247}
