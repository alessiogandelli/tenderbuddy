# 04: Uncertainty first-class

**What to build:** every item carries status, confidence and uncertainty flags. The "to review" panel lists everything doubtful or missing with count and colour, and the coverage report says how much of the tender is priced versus how much is left to fix. From there you open and correct the flagged item. Nothing that was not understood stays hidden.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every item exposes status and confidence, in the contract and in the interface
- [ ] The uncertainty flags are part of the contract and cannot silently disappear in a refactor
- [ ] The "to review" panel aggregates the flags with count and colour
- [ ] Coverage report split into calculated, supplier quote required, to review, out of scope
- [ ] Every flagged item can be opened and corrected from the panel
- [ ] Test on external behaviour: ambiguous or incomplete items come back with the right status and the right flags, and the coverage totals add up
