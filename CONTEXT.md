# From Tender to First Price

Turn a **Bando** (a tender document) into a readable, defensible **Preventivo** (quote): the PDF is uploaded, the engine extracts the items, links them to pricing data and produces costs, an indicative price and a bid range — explicitly flagging everything it did not understand.

## Language

### Document

**Bando**:
A tender document published by a client, the app's unit of work: it has a title, a description, a classification and its own Preventivo.
_Avoid_: practice, project, request

**Title**:
The one-line name by which the Bando is recognised at a glance in the archive.
_Avoid_: name, label, heading

**Description**:
The short summary of what the Bando is about, e.g. "Ventilation system".
_Avoid_: abstract, note, summary

**Classification**:
The type/domain detected for the Bando, which selects the pricing Profile.
_Avoid_: category, tag, domain

**Source page**:
The page of the Bando PDF from which an Item was extracted.
_Avoid_: reference, ref, source

**Traceability**:
The link between a number in the Preventivo and the exact region of the PDF it came from.
_Avoid_: audit trail, provenance

### Extraction

**Item**:
A priceable unit extracted from the Bando, or created by hand: description, quantity, unit, attributes.
_Avoid_: row, entry, record

**Unit**:
The measure of an Item, normalised (`pc`, `m`, `m2`, `h`, `LS`, `system`).
_Avoid_: UoM, measure, unit of measure

**Attribute**:
A technical characteristic used for matching (size, DN, fire-resistance class).
_Avoid_: property, feature, field

**Uncertainty flag**:
The marker that records what was not understood or is missing in an Item.
_Avoid_: warning, alert, error

**Status**:
The review/pricing condition of an Item (`calculated`, `supplier_quote_required`, `assumption_applied`, `review_required`, `insufficient_information`, `out_of_scope`, `non_priceable`).
_Avoid_: record status, phase

**Coverage**:
How much of the Bando is priced compared with what is left to fix.
_Avoid_: completion, progress percentage

### Pricing data

**Catalogue**:
The curated list of Products and supplier Packages against which pricing is done.
_Avoid_: price list, master data, warehouse

**Product**:
A Catalogue entry with a net cost and an Install Code.
_Avoid_: article, component, price-list article

**Supplier package**:
A Catalogue entry we cannot price and that requires a supplier quote.
_Avoid_: item to quote, external

**Match**:
The assignment of an Item to a Product, with a confidence.
_Avoid_: association, mapping, correspondence

**Install Code**:
The key that links an Item to its Productivity Rule.
_Avoid_: work code, work type

**Productivity rule**:
The base hours per unit and the labour role for an Install Code.
_Avoid_: hours table, hourly rate

**Project parameters**:
The factors, markups and commercial conditions specific to the project.
_Avoid_: config, settings, global parameters

**Pricing profile**:
The set of Catalogue, Productivity rules and Project parameters applied to a Bando.
_Avoid_: dataset, bundle, pricing configuration

### Price

**Material cost**:
The material cost of an Item, marked up by the waste percentage.
_Avoid_: article cost

**Labour cost**:
The installation cost of an Item, hours adjusted by rate.
_Avoid_: hour cost, installation cost

**Direct cost**:
The sum of material cost and labour cost of an Item or of the Bando.
_Avoid_: site cost, break-even

**Cost Baseline**:
The cost base of the Bando: direct cost marked up by overhead and transport/equipment. It is the base from which the bid range is computed.
_Avoid_: base cost, break-even, project cost

**Margin**:
The target margin percentage used to determine the selling price.
_Avoid_: markup (a different concept), profit

**Indicative price**:
The selling price computed from the Cost Baseline and the Margin.
_Avoid_: final price, quotation

**Bid range**:
The three Scenarios (Aggressive, Target, Conservative) with price, margin, estimated win probability and expected contribution.
_Avoid_: price range, bracket

**Scenario**:
One of the three bid hypotheses combining margin and win probability.
_Avoid_: option, alternative

**Preventivo**:
The priced result of a Bando: priced items, summary, indicative price and Bid range.
_Avoid_: offer, quotation, proposal

### Software product

**Extraction engine**:
The component that reads the PDF and produces Items; behind an interface, with interchangeable implementations.
_Avoid_: parser, reader, reading engine
