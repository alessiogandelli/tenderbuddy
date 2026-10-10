# 11: Match → Catalogue + routing to supplier quote

**What to build:** the extracted items attach to the catalogue: product, install code, confidence and price source. Those that find no match come out `no_match` and are visible; those that are a supplier package come out `supplier_quote_required` and do not receive an invented price. On the full tender the result is honest: the priced share is covered, the rest is flagged.

**Blocked by:** 05, 09

**Status:** ready-for-agent

- [ ] Every matched item exposes product, install code, confidence and price source
- [ ] An item with no match comes out with a no-match status, flagged
- [ ] A supplier package comes out `supplier_quote_required`, without an invented price
- [ ] The match is reviewable and replaceable by the user
- [ ] The match uses the item's attributes (size, type, fire resistance class), not simple string matching
- [ ] Test on external behaviour: on the full tender the match covers a significant share of the items and the rest is flagged honestly
