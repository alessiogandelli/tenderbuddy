# 09: Parse → Items (quantity, unit, variants, flags)

**What to build:** from the raw text of the document come the items with normalized quantity and unit; multi-variant rows (one description, several sizes) become distinct items, so that quantities are not lost. What remains ambiguous or incomplete comes out already flagged and appears in the "to review" panel.

**Blocked by:** 04, 08

**Status:** ready-for-agent

- [ ] Items with normalized quantity and unit come out of the raw text
- [ ] Multi-variant rows are expanded into distinct items
- [ ] Every item preserves the source page
- [ ] What is ambiguous or incomplete comes out with uncertainty flags and appears in the existing panel
- [ ] The extracted quantities match those of the verified example document
- [ ] Test on external behaviour: on a real tender the Parse produces items with coherent quantity and unit and flags for everything that was not understood
