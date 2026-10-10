# 01: Frozen contract + two independently startable trees

**What to build:** the tender JSON contract exists, is versioned and applies to both sides; `backend/` and `frontend/` start on their own with uv, poetry and pip; the webapp shows the contract version and the reachability of the backend. The provided golden example validates against the contract. This is the prefactoring that makes all the other moves easy.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The tender JSON contract is documented and versioned (schema + golden example) and the copies present in the two trees match
- [ ] The backend starts on its own with uv, with poetry and with pip
- [ ] The backend responds to a status check that exposes the contract version
- [ ] The frontend starts on its own and shows the contract version and the reachability of the backend
- [ ] The provided golden fixture validates against the contract in an automated test
- [ ] No cross dependency or import between the two trees
