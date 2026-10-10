# 03: Tender detail → Quote (golden to the cent)

**What to build:** I open a tender and see the items in a table with description, quantity, unit, matched product and source page; for each one material cost, labour cost and direct cost; the project summary with cost baseline; the indicative price with the margin; and the three bid range cards. A golden test guarantees that the 22 verified positions reproduce the expected output exactly.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Item table with description, quantity, unit, matched product and source page
- [ ] For each item: material cost, labour cost, direct cost
- [ ] Project summary and cost baseline calculated according to the golden numbers, excluding the project costs that the README includes but that the ground truth does not
- [ ] Indicative price with the margin
- [ ] Three bid range cards (Aggressive, Target, Conservative) with price, margin, estimated win probability and expected contribution
- [ ] Golden test: the 22 verified positions reproduce the expected output to the cent, with the win probability unrounded in the expected contribution
