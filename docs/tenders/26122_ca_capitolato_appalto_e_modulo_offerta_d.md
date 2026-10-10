# Tender analysis — 26122_ca_capitolato_appalto_e_modulo_offerta_d.pdf

_Pattern analysis for extraction prompts. Generated 2026-10-10 with `gpt-6.1-sol` (effort `medium`). 188 pages, 353325 chars. Deterministic LV-ish pages: 70._


## Document parts

| Part | Pages | Kind | Notes |
|---|---|---|---|
| Tender cover and offer totals | 1 | `cover` | Title: "CAPITOLATO D'APPALTO E MODULO D'OFFERTA" for "IMPIANTO DI VENTILAZIONE", CCC 244. Offer total, VAT and signature fields are not BOQ positions. |
| Contents and attachment lists | 2–3 | `index` | The index identifies "CAPITOLATO D’APPALTO" as pages 12–114, "BASI DI CALCOLO" as pages 115–116 and "MODULO D’OFFERTA" as pages 117–188. Listed drawing attachments are references, not drawings reproduced in the supplied text. |
| Offer correction form | 4 | `modulo_offerta` | Administrative correction table with "Pag.", "Posizione", "Prezzo esposto", "Prezzo corretto", "p. unitario" and "Importo CHF.". This is not a priceable LV. |
| Bidder declarations | 5–11 | `legal` | Bidder information, subcontractor offer amount, insurance amounts, compliance declarations and signatures. Exclude these monetary fields from work-item extraction. |
| Disposizioni Particolari and general contractual conditions | 12–54 | `legal` | Numbered procurement, contractual, site, execution, measurement, insurance, reporting, invoicing and payment conditions. Page 15's "Quantità principali" is a project quantity summary, not a priceable table. References to global prices, deductions and costs included in unit prices are contractual context. |
| Administrative obligations and technical specifications | 55–76 | `specifications` | Page 55 transitions into "1000 Prescrizioni tecniche." Standards, responsibility matrices, installation, commissioning, documentation, warranties and execution requirements follow. Page 61's responsibility matrix and page 74's duct-leakage table are not pricing tables. |
| Price composition, supplementary work and execution-time declarations | 77–78 | `specifications` | Bidder-fillable material/transport-and-installation percentage breakdowns and out-of-hours price-variation declarations. These are ancillary offer fields, not BOQ positions. |
| Product equivalence criteria | 79–84 | `specifications` | Technical equivalence tables contain tolerances, capacities and operating parameters, not quantities and prices for offer items. |
| Proposed supplier and brand schedules | 85–87 | `specifications` | Product-choice tables headed "Prodotti", "Proposta del progettista", "Proposta dell’assuntore", "Fornitore" and "Marca". Page 87 also begins project-specific conditions. |
| Project-specific conditions and ventilation specifications | 88–96 | `specifications` | Contractual, logistical and technical requirements. Numbered clauses and costs included in unit prices are not priceable offer rows. |
| Air-handling-unit specifications | 97–109 | `specifications` | Sections 1651 and 1652 describe the two UTAs. Several extracted pages contain only document headers; whether they contain images or other unextracted content cannot be established. Do not interpret them as empty price tables. |
| Control-system requirements and separate maintenance/service offer instructions | 110–114 | `specifications` | MCRC requirements and requests for separate maintenance and standby-service offers. Page 113 equipment counts are a maintenance-scope inventory, not installation BOQ rows. |
| CPN 103 contractual calculation bases | 115 | `legal` | CPN-style codes without BOQ pricing rows. The "% 20" fixed share and "% 80" transferable share concern price adjustment. |
| Price-adjustment form | 116 | `modulo_offerta` | "FORMULARIO PER VARIAZIONE DEI PREZZI" is a financial adjustment form. Exclude its indexes, percentages, VAT and totals from item extraction. |
| Offer-module divider | 117 | `cover` | Contains "MODULO D’OFFERTA"; no priceable rows. |
| UTA1 / UTA TETTO — CPN offer schedule | 118–149 | `lv` | Chapters 461, 462, 465, 466, 497 and 468. Table structure starts on page 118; the first actual priceable row is R 291.011 on page 119. Conditions, shared descriptions, priced leaves and section closings coexist within the table region. |
| UTA2 / UTA PC — CPN offer schedule | 150–178 | `lv` | Chapters 461, 462, 465, 466, 497 and 468. Page 150 introduces the unit; supply pricing starts on page 151. Repeated position numbers must remain distinct from UTA1 through their allocation context. |
| DIV — Dismantling | 179–182 | `lv` | Chapter 999, UdO DIV, SdC 249.1. Seven priced positions use "1.00 ac"; indicative lengths, counts, dimensions and weights remain scope information. |
| DIV — Documents and miscellaneous services | 183–186 | `lv` | Chapter 998, UdO DIV, SdC 249.3. Mostly lump sums, plus R 211.037 with "8.00 up", explicitly defined as a complete test per system. |
| DIV — Daywork | 187 | `lv` | Chapter 999, UdO DIV, SdC 249.4. Five hourly labour rows and one lump-sum materials allowance with an embedded blank discount-percentage field. |
| Recapitulation | 188 | `modulo_offerta` | "Ricapitolazione        selezionata secondo: SdO UdO SdC" contains section totals and "Totale Importo parziale (Importo senza IVA)". Do not extract these as additional positions. |

## Priceable sections (LV / preziario / modulo offerta)

### UTA1 — Centrale di ventilazione / air-treatment equipment, CPN 461 — pages 118–120

**Layout.** Vertically wrapped hierarchical descriptions followed by allocation 244 / UTA1 / 244.0, visible A marker, quantity/unit and two underscore price fields. Repeated column labels occur at the bottom of extracted pages. Page 118 is introductory; first priceable leaf R 291.011 is on page 119.

**Position numbers.** `Three-digit parent plus dot-three-digit suffix, optionally R-prefixed. Parent, R and suffix may be on separate lines; e.g. R 291 + R + .011 becomes R 291.011.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** ac

### UTA1 — Canali, CPN 462 — pages 121–131

**Layout.** Allocation 244 / UTA1 / 244.2. Pages 121–122 contain conditions and shared descriptions; first priced leaf R 219.203 is on page 123. Size variants have independent quantity/unit blocks. Standard and custom leaves, percentage-based ac rows and cross-page descriptions occur.

**Position numbers.** `Three-digit parent and inherited .three-digit suffix. Examples: R 219.203, 311.101, R 311.911, 362.115 and R 379.013. A custom R suffix can occur beneath a standard parent.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** m, pz, ac

### UTA1 — Griglie e diffusori, CPN 465 and 466 — pages 132–137

**Layout.** Allocation 244 / UTA1 / 244.3. First quantity row on page 133. Chapter 466 conditions begin near the end of page 135, before its page-136 header. R 219.018 description on page 136 receives its quantity on page 137.

**Position numbers.** `Main number plus inherited suffix, optionally R-prefixed. Examples: R 211.943, 711.112 and R 219.028.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### UTA1 — Apparecchi e accessori, CPN 466 — pages 138–144

**Layout.** Allocation 244 / UTA1 / 244.4. Page 138 contains conditions; priceable rows begin on page 139. Long equipment descriptions continue across pages. Page 144 is a section closing page without positions.

**Position numbers.** `Examples: 321.111, R 331.924, R 339.911, R 529.201 and 721.132.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### UTA1 — Isolamento, CPN 497 — pages 145–146

**Layout.** Allocation 244 / UTA1 / 244.5. Long insulation descriptions terminate in m2 pricing cells. R 111.013 spans both pages.

**Position numbers.** `R-prefixed hierarchy; priced leaves R 111.011, R 111.013 and R 111.031.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** m2

### UTA1 — Regolazione, CPN 468 — pages 147–149

**Layout.** Allocation 244 / UTA1 / 347.0. Page 147 is conditions only. Page 148 starts priceable work under "SOLO MONTAGGIO". Page 149 contains three ac service rows, including a prescribed CHF 5000 allowance.

**Position numbers.** `R 891.911 through R 891.993, interspersed with non-priceable grouping suffixes such as .910 and .990.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### UTA2 — Centrale di ventilazione, CPN 461 — pages 150–152

**Layout.** Allocation 244 / UTA2 / 244.0. Introduction on page 150; unit supply in pz on page 151, followed by separate ac transport, installation and commissioning rows.

**Position numbers.** `R 291.012, R 291.022, R 291.032 and R 291.041–043. Group headings .010, .020, .030 and .040 supply shared scope.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### UTA2 — Canali, CPN 462 — pages 153–161

**Layout.** Allocation 244 / UTA2 / 244.2. Conditions on pages 153–154; priced leaves begin on page 155. Rectangular ducts and pipes use m, fittings use pz, and two percentage-based rows use ac.

**Position numbers.** `Examples: R 219.203, R 219.991, R 229.702, 311.102 and R 311.911.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** m, pz, ac

### UTA2 — Griglie e diffusori, CPN 465 and 466 — pages 162–167

**Layout.** Allocation 244 / UTA2 / 244.3. Page 162 contains conditions; priced variants start on page 163. Chapter 466 conditions begin near the bottom of page 165 and continue on page 166. Descriptions and quantity cells can span excerpt and page boundaries.

**Position numbers.** `Examples: R 211.912, R 211.943, R 213.945, R 213.992, 712.112, R 219.019 and R 219.028.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz

### UTA2 — Apparecchi e accessori, CPN 466 — pages 168–173

**Layout.** Allocation 244 / UTA2 / 244.4. Page 168 contains conditions; quantity-bearing rows begin on page 169. Equipment variants inherit shared descriptions and may span pages.

**Position numbers.** `Examples: 321.114, R 331.921, R 339.917, R 529.311 and 611.211.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### UTA2 — Isolamento, CPN 497 — pages 174–175

**Layout.** Allocation 244 / UTA2 / 244.5. Three area-priced leaves with long custom descriptions.

**Position numbers.** `R 111.011, R 111.031 and R 111.041.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** m2

### UTA2 — Regolazione, CPN 468 — pages 176–178

**Layout.** Allocation 244 / UTA2 / 347.0. Page 176 contains conditions. Page 177 specifies "SOLO MONTAGGIO"; piece-priced installation is followed by ac coordination and consulting services.

**Position numbers.** `R 891 quantity-bearing leaves, including R 891.991, R 891.992 and R 891.994.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** pz, ac

### DIV — Smontaggi, CPN 999 — pages 179–182

**Layout.** Allocation 244 / DIV / 249.1. Indicative component quantities appear in descriptions, but all seven actual pricing blocks are 1.00 ac.

**Position numbers.** `R 512.022, R 512.028, R 512.041, R 512.042, R 512.043, R 512.044 and R 512.046.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** ac

### DIV — Documenti e diversi, CPN 998 — pages 183–186

**Layout.** Allocation 244 / DIV / 249.3. Mostly ac service rows. R 211.037 has its description on page 185 and 8.00 up pricing block on page 186.

**Position numbers.** `R 211.001 and subsequent leaves. Continuation 211 .037 omits the earlier R marker.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** ac, up

### DIV — Regie, CPN 999 — pages 187

**Layout.** Allocation 244 / DIV / 249.4. Hourly tariff leaves inherit role headings. Final materials row uses 1.00 ac with a descriptive CHF 3000 allowance basis and blank discount field.

**Position numbers.** `R 182.131, R 182.161, R 182.171, R 182.181, R 182.211 and R 182.911.`

**Columns.** Pos., Testo, GQ, Qtà, UM, Prz/Un, Totale, TP

**Units seen.** h, ac


## Position patterns

- Priceable leaf with allocation and pricing cells — .112 DN 100.
244
: UTA1
: 244.2
A
8.00 pz___________
___________ — Under parent 331 on page 129, reconstruct 331.112. Store allocation separately. Extract quantity 8.00 and unit pz from the pricing cell; the underscore fields are blank unit price and total.
- Whole-scope equipment lump sum — Page 119: 'R 291', 'R', '.011 UTA P0 / P1 / P2', then '244', ': UTA1', ': 244.0', 'A', '1.00 ac___________', '___________'. — Reconstruct R 291.011 and emit one LS row. Retain equipment identification, supplier/model fields and reference 1651.000 without creating referenced specification items.
- Shared description with dimensional variants — Page 123: 'R 219', 'Rettangolari', '.200 a x b', '.203 200 x 100 mm' with '44.00 m', '.205 200 x 200 mm' with '10.00 m', and '.208 300 x 200 mm' with '85.00 m'. — Emit one row per quantity-bearing suffix. Inherit applicable rectangular galvanized-steel duct scope. Keep dimensions in descriptions; do not emit .200 as an item.
- Standard material variants — Page 128: '311', 'Tubo spiroidale.', '.100 Diametro (1):', '.101 DN 80.' with '510.00 m', '.102 DN 100.' with '926.00 m'. — Reconstruct 311.101 and 311.102, inherit spiral-pipe scope and applicable 300.170 requirements, and extract the quantity before m rather than the DN value.
- Multiline variant — Page 127: 'R 299 .100', then '.101 Dimensioni cassoncino', '(A x B x P):', '300 x 200 x 300 mm', 'Canale di raccordo', 'ø 80 mm', followed by '22.00 pz'. — Emit one R 299.101 row with all dimensional and connection lines and applicable shared connection-box scope.
- Changing shared product scope — R 529
R
.200 Regolatore di volume
VARIABILE
Compreso involucro
fonoassorbente
Marca: Trox
Tipo   : TVJ-D / BC0
...
R
.201 Dim.: 200x100 mm
...
48.00 pz___________
...
R
.202 Dim.: 300x100 mm
...
10.00 pz___________ — Emit R 529.201 and R 529.202 independently with .200 context. Later .300 changes scope to a silencer; reset inherited product context rather than carrying the regulator type forward.
- R marker and main number split across lines — R 379
Griglia di aspirazione
...
R
.010
R
.011 DN80 — Maintain parent 379 and modified-text marker R; reconstruct R 379.011. Standalone R and grouping suffixes without pricing cells are not items.
- Cross-page parent continuation — Page 119 ends '.030 Posa', 'Posa da eseguire secondo gli'; page 120 starts 'R 291 .030 articoli del capitolo 1245'. Page 123 starts '200 .170 e diramazioni.' continuing page 122. — Carry hierarchy and description state across pages. Merge repeated identifiers into existing scope. R 291.030 is a parent; R 291.031 is the priced installation leaf.
- Quantity on the following page — R
.018 1'100 x 600 mm — The page-136 description continues on page 137 as '219 .018 244' with UTA1 / 244.3 allocation and 2.00 pz. Merge into R 219.018, retaining R despite its omission on the continuation.
- Equipment description across pages — Page 169 starts '.926 Marca: Trox Hesco'; page 170 continues 'R 331 .926 Marca    : ................' and supplies '2.00 pz'. — Join description and pricing block as one R 331.926 row. A repeated full code is not automatically a new position.
- Percentage surcharge with ac unit — Page 128: 'R', '.911 Percentuali per fissaggi', 'totale della posizione', '311.xxx dei canali.', '(percent. consigliata 30%)', followed by '1.00 ac'. — Emit R 311.911 as a percentage-based surcharge, retaining table quantity/unit and explicit basis. The printed 30% is advice, not an entered rate.
- Ordinary piece-priced surcharge — R
.991 Maggiorcosto per colorazione
RAL a scelta griglie
...
77.00 pz___________ — Emit R 211.991 independently as a piece-priced item. Maggiorcosto does not imply percentage pricing.
- Allocation identifiers — '244', ': DIV', ': 249.1', 'A', '1.00 ac___________' — Store 244 / DIV / 249.1 as SdO / UdO / SdC. The preceding CPN parent and suffix identify the item; A remains a raw table marker.
- Hourly role variants — '.130 Capo montatore' / '.131 Tariffa per orario normale' with '15.00 h' — Combine role heading and tariff leaf into R 182.131. Emit separate rows for the other quantity-bearing labour-role variants.
- Complete test per system — '.037 Prove di ermeticità' / 'up=prova completa per ogni impianto' followed on page 186 by '8.00 up' — Emit R 211.037 with quantity 8 and normalized unit system, preserving the source definition. It is not one global lump sum.
- Numbered conditions resembling items — 121.100
COM. — Do not emit an item from a code alone. Pre-LV conditions and in-table general provisions require independent allocation and pricing-cell evidence.
- Modified CPN condition marker — R 219.100 In ordine di priorità: — Page 12 explains that R marks text differing from original CPN wording. Preserve the marker and variable spacing; it does not independently establish priceability, optionality or lump-sum pricing.
- Embedded position reference — Vedi pos. 441.300. — Treat as a reference, not a new row. Do not automatically merge referenced text into the current description.
- Non-priceable principal-quantity summary — Unità di trattamento aria da 7'100 m³/h
pz
1 — Exclude page 15's Quantità principali summary. Airflow is equipment capacity, not the billing unit; this occurrence is not an offer row.
- Four-digit specification clause — 1264.005 Le portate di acqua e di vapore dovranno essere conformi ai documenti di calcolo. — Exclude from priced rows. Four-digit specification numbering does not establish the LV numbering scheme.
- Irregular non-priceable identifiers — 855100 — Page 49 prints this below 855 / Servizio invernale. Preserve and flag the apparent missing separator rather than silently creating an LV code. Similarly preserve '1105. 46' and page 88's '1252.020' as source specification identifiers.
- Technical variants rather than price variants — Canali immissione esterni
: isolamento esterna
spessore 80 / 100 mm — This is clause 1318.011 on page 75. Do not split thickness alternatives into priced rows without LV pricing blocks.


## Lump-sum / "una tantum" positions

- UTA1 R 291.011 — complete supply of UTA P0 / P1 / P2 and scope referenced in 1651.000. — 119 — 'Fornitura di tutto quanto descritto' and '1.00 ac___________'. — Emit one LS row, quantity 1.00; do not normalize to system merely because this is complete equipment.
- UTA1 R 291.021 — complete UTA transport. — 119 — 'Trasporto di tutto quanto descritto' and '1.00 ac___________'. — Emit separately from supply; inherit R 291.020 transport scope.
- UTA1 R 291.031 — complete UTA installation. — 120 — 'Posa di tutto quanto descritto' and '1.00 ac___________'. — Emit one LS row and inherit installation scope continued from page 119.
- UTA1 R 291.041, R 291.042 and R 291.043 — initial parameterization, first commissioning and final commissioning. — 120 — Each leaf has '1.00 ac___________'; descriptions include '.041 Parametrizzazione iniziale', '1° messa in funzione delle unità di trattamento aria.' and 'Messa in funzione definitiva'. — Emit three separate LS rows. Retain commissioning requirements and references; do not combine or deduplicate the services.
- UTA1 R 711.191 — colour surcharge for supply-air outlets. — 134 — 'Maggiorcosto per colorazione RAL a scelta bocchette immissione' with '9.00 ac'. — Normalize ac to LS but preserve quantity 9.00. Flag for review without changing the unit or forcing quantity to one.
- UTA1 R 339.917 — fire-damper addressing instruction by supplier technician. — 141 — 'Istruzione indirizzamento serrande tagliafuoco da parte del tecnico specializzato della ditta fornitrice' with '1.00 ac'. — Emit separately from controller supply and pz-based commissioning.
- UTA1 R 891.991 — collaboration with heating contractor. — 149 — 'Collaborazione con ditta di riscaldamento'; description starts on page 148 and ends with '1.00 ac' on page 149. — Merge both pages and emit one coordination LS row.
- UTA1 R 891.992 — technical assistance to controls contractor. — 149 — 'Assistenza tecnica a ditta di regolazione', 'Prestazione di servizio' and '1.00 ac'. — Emit one LS row and retain 'prescrizioni tecniche nr. 1236'.
- UTA1 R 891.993 — controls-design consultancy. — 149 — 'Consulenza per progettazione regolazione'; '1.00 ac'; 'IMPORTO DA CONSIDERARE: 5'000Fr (cinquemila)'; trailing '5'000.-'. — Record one LS row with prescribed CHF 5000 allowance. Do not double-count the trailing amount or invent its precise printed price-column placement.
- UTA2 R 291.022 — transport of scope in 1652.000. — 151 — 'Trasporto di tutto quanto descritto nel capitolo 1652.000' and '1.00 ac'. — Emit one LS transport row with shared .020 scope. Keep separate from the pz-priced UTA supply.
- UTA2 R 291.032 — installation of scope in 1652.000. — 152 — 'Posa di tutto quanto descritto nel capitolo 1652.000' and '1.00 ac'. — Emit one LS installation row, inheriting .030 scope across pages 151–152.
- UTA2 R 291.041, R 291.042 and R 291.043 — parameter setting, first commissioning and final commissioning. — 152 — Each has its own allocation and '1.00 ac' pricing block. — Emit three separate LS rows.
- UTA2 R 339.917 — fire-damper addressing instruction. — 170 — 'Istruzione indirizzamento serrande tagliafuoco da parte del tecnico specializzato della ditta fornitrice' and '1.00 ac'. — Emit one LS row under UTA2; do not merge with the repeated UTA1 code.
- UTA2 R 891.991 and R 891.992 — heating-contractor coordination and controls-contractor assistance. — 178 — Each leaf has '1.00 ac'. — Emit two separate LS rows. R 891.991 starts on page 177.
- UTA2 R 891.994 — controls-design consultancy. — 178 — 'Consulenza per progettazione regolazione'; '1.00 ac'; 'IMPORTO DA CONSIDERARE: 5'000Fr (cinquemila)'; trailing '5'000.-'. — Emit one LS row with prescribed CHF 5000 allowance, avoiding duplicate extraction of the detached amount.
- DIV R 512.022 — rectangular duct dismantling. — 179 — '1.00 ac' despite '600x300mm: 250m', '1'250x500mm: 150m' and '100x300mm: 70pz'. — Emit one LS package; retain embedded lengths and counts as indicative scope.
- DIV R 512.028 — circular duct dismantling. — 180 — '1.00 ac' despite 'Ø150mm: 400m' and '100x300mm: 40pz'. — Join scope beginning on page 179 and emit one LS package.
- DIV R 512.041 — dismantling UTA 1 and condensing unit. — 180 — '1.00 ac'. — Emit one LS package including refrigerant recovery. Dimensions, weights and 'Quantità: 10kg' remain scope data.
- DIV R 512.042, R 512.043 and R 512.044 — dismantling UTA 2, 3 and 4. — 181 — Each leaf has '1.00 ac'. — Emit three independent LS rows. R 512.042 starts on page 180.
- DIV R 512.046 — extraction fan dismantling. — 182 — '1.00 ac' after '5 pezzi'. — Emit one LS package covering five fans, not a quantity-5 pc row. Scope starts on page 181.
- DIV R 211.001, R 211.002, R 211.003 and R 211.005 — technical assistance and RCS collaboration. — 183 — Each leaf has '1.00 ac'. — Emit four separate LS rows with prescription references retained.
- DIV R 211.008 and R 211.011 — execution collaboration and technical coordination meetings. — 184 — 'Collaborazione esecutiva' and 'Riunioni di coordinamento tecnico', each with '1.00 ac'. — Emit two LS rows. Retain conditional DWG-plan fee and recommended 'Fr. 2'500.- (5 x 500.-)' as guidance for .008; retain 10 meetings and 15 estimated hours as scope for .011.
- DIV R 211.018, R 211.019, R 211.022, R 211.023, R 211.024 and R 211.031 — transport, workshop plans, commissioning, handover, revision documents and instructions. — 185 — Each leaf has '1.00 ac'. — Emit six separate LS rows. R 211.018 starts on page 184. Preserve recommended minimum CHF 4000 for .024 and CHF 1500 for .031 as guidance, not entered prices.
- DIV R 211.039 and R 211.041 — product changes and Minergie certification services. — 186 — 'Cambiamento prodotti' and Minergie services each have '1.00 ac'. — Emit two LS rows. Flag .039 as conditional: '(prezzo da esporre solo in caso di cambiamento di prodotti)'. Do not invent a price.
- DIV R 182.911 — daywork materials allowance. — 187 — '1.00 ac'; 'per un'importo previsto di Fr. 3'000- (tremila)'; 'Importo netto'. — Emit one LS materials row with CHF 3000 basis and blank discount attribute. Do not assume net price equals CHF 3000.


## Percentage positions

- UTA1 R 219.991 — rectangular-duct fixing surcharge. — 124 — 'totale della posizione 219.xxx dei canali.' in CPN 462 / 244 / UTA1 / 244.2; '(percent. consigliata 30%)'. — Emit a percentage-based row retaining quantity 1.00 and raw unit ac, normalized LS. 'Percentuale del..............%' and 'Su Fr........................' are blank entry fields. Keep recommended 30% separate from offered rate. Link only to underlying 219 duct rows, excluding the surcharge itself.
- UTA1 R 311.911 — spiral-pipe fixing surcharge. — 128 — 'totale della posizione 311.xxx dei canali.' in CPN 462 / 244 / UTA1 / 244.2; '(percent. consigliata 30%)'. — Emit a percentage-based row despite 1.00 ac. Offered percentage and CHF basis remain unknown. Exclude the surcharge itself from its basis and do not calculate from the recommendation.
- UTA2 R 219.991 — rectangular-duct fixing surcharge. — 156 — Description begins on page 155 and continues 'totale della posizione 219.xxx dei canali.' in CPN 462 / 244 / UTA2 / 244.2; '(percent. consigliata 30%)', 'Percentuale del..............%' and 'Su Fr........................'. — Merge pages and emit one percentage-based row with quantity 1.00 ac. Link only to UTA2 underlying 219 duct rows, excluding the surcharge. Leave offered rate and monetary basis unknown.
- UTA2 R 311.911 — spiral-pipe fixing surcharge. — 159 — 'totale della posizione 311.xxx dei canali.' in CPN 462 / 244 / UTA2 / 244.2; '(percent. consigliata 30%)'. — Emit a percentage-based 1.00 ac row. Exclude itself, position 313 flexible pipes, UTA1 rows and other chapters from the basis. Do not calculate from blank prices or the recommendation.
- Embedded materials discount in DIV R 182.911. — 187 — SUISSETEC 2026 materials allowance: 'per un'importo previsto di Fr. 3'000- (tremila)'; 'La ditta offerente, in caso di delibera, accorderà uno sconto del...............%'. — Store as a discount attribute of the 1.00 ac materials row, not a separate percentage position. Rate is blank. If later supplied as d, net allowance is CHF 3000 × (1 − d/100); do not default blank discount to zero.
- Ancillary, non-LV price-composition declaration 1410.015. — 77 — Each indicated unit price: 'Condotte e pezzi speciali\n........ % M +…..... % T+M\n= 100 % del prezzo indicato', repeated for other categories. — Exclude from BOQ rows. If ancillary offer fields are requested, capture blank material and transport/installation percentages per category. Printed 100% is not an offered rate or surcharge.
- Ancillary, non-LV out-of-hours price variations 1410.022 and 1410.023. — 78 — 1410.022: 'Variazione del prezzo (materiale + montaggio).' 1410.023: 'Variazione del prezzo (solo manodopera).' Both request night, Saturday and Sunday/public-holiday percentages. — Keep separate ancillary declarations, not BOQ rows. Preserve blank fields and the 1410.023 heading/body ambiguity: its explanatory sentence also refers to '(materiale + montaggio)'. Do not invent percentages.


## Unit vocabulary

- pz — pc — Verified pricing unit for equipment, fittings, grilles, sensors and some services. UTA2 supply remains pc because the source says pz; do not automatically map complete equipment to system.
- ac — LS — A corpo. Verified for packages and services, and also percentage-based surcharge rows. Preserve actual quantity, including 9.00 ac on page 134; add percentage classification where applicable.
- m — m — Verified duct and pipe pricing unit. Occurrences inside dismantling scope are indicative lengths, not additional pricing quantities.
- m2 — m2 — Verified insulation pricing unit for both UTAs. Match the complete token before m. Building-area and compound technical-unit occurrences outside pricing cells are not BOQ quantities.
- h — h — Verified labour pricing unit on page 187.
- up — system — Explicit definition 'up=prova completa per ogni impianto'; R 211.037 has quantity 8.00.
- ore — h — Linguistic mapping in reporting and working-day definitions, not a source pricing-cell token.
- pezzi — pc — '5 pezzi' appears inside an ac fan-dismantling package, not as its pricing unit.
- m3/h — not_a_pricing_unit — Airflow specification, including 'Portata aria: 4'445 m3/h' on page 151. Do not interpret as cubic-metre billing.
- m³/h — not_a_pricing_unit — Equipment airflow capacity in page 15's principal-quantity summary, not a pricing unit.
- prezzo forfetario — LS — Page 52 contractual reporting category only; do not treat the phrase as a source table unit or standalone item.
- prezzi globali — LS — Page 52 contractual category only. Preserve original terminology and do not infer a standalone priceable row from it.


## Extraction rules

- Read the partial analyses cumulatively. Their source-text coverage collectively spans pages 1–188; excerpt-local statements that other pages are unavailable do not apply to the merged analysis. Preserve uncertainty about unextracted visual content and ambiguous flattened price-column placement.
- Use the deterministic map to confirm the continuous CPN table region on pages 118–187. Source-backed analysis establishes the structural start on page 118 and first actual priceable row R 291.011 on page 119.
- Exclude pages 1–117 from installation BOQ extraction. Keep administrative forms, contractual conditions, technical specifications, inventories and ancillary declarations separate.
- Emit only a resolved CPN leaf associated with an allocation block and quantity/unit pricing cells. Do not emit chapter headings, general provisions, grouping suffixes or shared descriptions merely because they occur under a table header.
- Preserve printed columns 'Pos.', 'Testo', 'GQ', 'Qtà', 'UM', 'Prz/Un', 'Totale', 'TP'. The flattened footer includes 'GQ        Qtà UM' and 'Prz/Un              Totale'. Do not require column labels to precede the first row.
- Parse allocation blocks separately, for example '244\n: UTA2\n: 244.2\nA\n190.00 m___________\n___________'. Store SdO, UdO and SdC; preserve A without inventing its expansion or a TP value.
- An observed quantity-cell pattern can combine the verified units: '^\s*([0-9]+(?:[\x27’][0-9]{3})*(?:\.[0-9]+)?)\s*(m2|pz|ac|m|h|up)\s*_+' in multiline mode. Associate each match with the active leaf and allocation.
- Reconstruct identifiers from three-digit parent and dot-three-digit suffix. Handle parent and suffix on separate lines, standalone R lines, custom suffixes beneath standard parents, explicit forms such as 'R 229 .313', and leading zeroes.
- R denotes modified/custom CPN text. Preserve it in the displayed identifier or separately; do not interpret it as optionality, lump-sum pricing or independent proof of priceability.
- Use CPN chapter + SdO + UdO + SdC + full position number as identity. UTA1 and UTA2 repeat codes and must not be deduplicated by position number alone.
- Carry chapter, allocation, parent, R marker, shared-description hierarchy and unfinished leaf across pages and partial-analysis boundaries. Strip repeated page furniture and column labels before joining descriptions.
- Repeated full identifiers at page starts can continue descriptions or supply delayed pricing cells. Merge continuations such as R 219.018, R 111.013, R 339.911, R 331.926 and R 211.037 rather than emitting duplicates.
- Account for chapter changes within pages: new CPN 466 conditions begin near the ends of pages 135 and 165 before the following chapter headers.
- Emit separate quantity-bearing size variants and separate supply, transport, installation and commissioning services. Inherit applicable parent scope, but reset it when intermediate headings change product or service context.
- Keep dimensions, DN values, capacities, technical tolerances, model numbers and specification references in descriptions. Extract measured quantities only from pricing cells.
- Blank underscores are unspecified prices, not zeros. Dotted brand/model fields and blank percentage fields likewise remain unfilled.
- Classify ac as LS while preserving source quantity. For fixing surcharges with percentage-entry fields and a referenced monetary basis, additionally classify pricing method as percentage-based.
- Store recommended 30% fixing rates separately from offered percentages. Restrict each calculation basis to the specified chapter, system, allocation and position family, excluding the surcharge itself.
- Preserve prescribed CHF 5000 consultancy allowances for UTA1 R 891.993 and UTA2 R 891.994. Do not double-count detached trailing amounts or assign an unsupported printed price-column coordinate.
- Keep recommended amounts, conditional fees and required allowances distinct. CHF 2500 DWG guidance and recommended minimums CHF 4000 and CHF 1500 are not automatically bid prices.
- For DIV R 182.911, keep CHF 3000 as allowance basis and the discount blank. Do not assume a net price or create a separate discount row.
- Retain 'SOLO MONTAGGIO' for R 891 equipment groups. Do not describe these as supply-and-install merely because other chapters include transport and installation.
- For dismantling and other ac packages, keep embedded lengths, counts, meetings, hours, weights and dimensions as scope rather than generating extra measured items.
- Normalize numeric thousands separators only in numeric fields; preserve quoted source text. Distinguish '1'250 x 400 mm' dimensions, '5'000Fr' amounts and '4'445 m3/h' airflow by context.
- Normalize verified pricing units ac→LS, pz→pc, m→m, m2→m2, h→h and up→system. No priced m3 unit is established.
- Treat references such as '1651.000', '1652.000', '1245', 'nr. 1250' and 'Vedi pos. 441.300.' as scope references, not new positions.
- Keep ancillary percentage declarations on pages 77–78 outside BOQ output. Preserve blank fields and the 1410.023 wording ambiguity if extracting ancillary offer data.
- Exclude page 188 and SdC/UdO/SdO closing or subtotal lines from item output; retain verified totals separately.
- Do not fabricate omitted full CPN wording. The offer schedule uses abbreviated descriptions and states that the full CPN text governs.


## Gotchas

- The partial analyses describe different excerpts of the same tender. Their statements about unavailable earlier or later pages are local limitations, not gaps in the combined coverage.
- The indexed offer module starts on page 117, table structure starts on page 118, and actual pricing starts on page 119. These are distinct boundaries.
- Every page from 118 to 187 has detected table headers, including conditions-only pages. Pages 121–122, 132, 138, 147, 150, 153–154, 162, 168 and 176 do not become priceable merely from that signal; page 144 is a closing page.
- The footer header appears at the bottom of extracted pages. Treating it as a start-of-items delimiter misses valid rows.
- The correction form on page 4 has explicit price columns but is not an LV. Page 15's principal quantities and page 113's maintenance inventory likewise must not be duplicated into the installation BOQ.
- Position-like codes occur throughout legal and technical text, including three-digit clauses, R-prefixed clauses, four-digit specification codes and standards references such as 'SIA 381.101'. Code counts are not item counts.
- Chapter numbers, project number 2209, header value 409, page numbers and allocation code 244 can resemble parent positions.
- The allocation string '244 : UTA1 : 244.2' is not a compound item number. The following A marker has no supported expansion in the supplied analyses.
- R spacing varies, and continuations can omit it. Preserve the established custom marker when joining '219 .018' or '211 .037' continuations.
- Descriptions cross both page and excerpt boundaries. Do not retain artificial incomplete-row conclusions where the following partial analysis supplies the continuation.
- Shared product context changes within parents such as R 529 and R 211. An earlier brand/type must not contaminate later variant groups.
- Service and surcharge wording does not determine the unit. Commissioning can be pz-priced; colour surcharges can use pz or the unusual explicit 9.00 ac.
- UTA1 supply is ac-priced, whereas UTA2 complete UTA supply is pz-priced. Do not normalize complete units uniformly to system.
- Fixing surcharges use ac rather than a percent unit. Their recommended 30% is not an entered bidder value, and their basis must not include the surcharge itself.
- The materials discount on page 187 is embedded in an ac row. Emitting it as a separate percentage position would duplicate scope.
- Required CHF 5000 allowances differ from recommended CHF 2500, CHF 4000 and CHF 1500 amounts. Detached repeated amounts must not be counted twice.
- Fan dismantling mentions '5 pezzi' but is priced 1.00 ac; coordination mentions 15 hours but is also priced as an ac package.
- Preserve source quantities even when related rows look inconsistent: page 142 has 10.00 pz for R 529.202 and 26.00 pz for R 529.311.
- Technical tables are not price tables: page 61 assigns responsibilities, page 74 gives leakage limits, pages 80–84 give equivalence tolerances, and pages 85–87 collect supplier/brand choices.
- Non-BOQ percentages include IVA 8.1%, penalties, award weights, the performance guarantee, page 34's 0.5% settlement deduction, page 45's 10% authority threshold, page 51's 0.3% insurance participation, technical tolerances and the 20/80 price-adjustment shares.
- The 'prezzo globale dell’impianto di cantiere' references on pages 47–48 and reporting categories 'prezzo forfetario' / 'prezzi globali' on page 52 do not establish standalone LS rows.
- CHF values outside the LV include penalties, claims thresholds and insurance coverage limits, not line prices.
- Dotted supplier/model blanks, RAL 9010, QAM2112.040, 250 Hz, voltage values and specification references are not quantities, prices or new leaf identifiers.
- Preserve irregular identifiers rather than silently repairing them: '855100', '1105. 46' and '1252.020' within section 1452.
- Several specification pages have little extracted text; their unextracted visual content cannot be determined from character counts.
- The statement 'Le varianti non sono ammesse.' concerns alternative bids, not separately priced dimensional variants within the BOQ.
- The abbreviated schedule states 'In ogni caso vale la versione CPN con il testo integrale.' Visible descriptions must not be presented as the complete standard contractual wording.


---

Analysis usage: {"model": "gpt-6.1-sol", "effort": "medium", "calls": 8, "input_tokens": 215958, "output_tokens": 38781}
