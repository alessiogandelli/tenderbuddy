# 09: Parse → Item (quantità, unità, varianti, Flag)

**What to build:** dal testo grezzo del documento escono gli Item con quantità e unità normalizzate; le righe multi-varianti (una descrizione, più dimensioni) diventano Item distinti, così le quantità non si perdono. Ciò che resta ambiguo o incompleto esce già Flagged e compare nel pannello "da rivedere".

**Blocked by:** 04, 08

**Status:** ready-for-agent

- [ ] Dal testo grezzo escono Item con quantità e unità normalizzate
- [ ] Le righe multi-varianti sono espanse in Item distinti
- [ ] Ogni Item conserva la Pagina sorgente
- [ ] Ciò che è ambiguo o incompleto esce con Flag di incertezza e compare nel pannello esistente
- [ ] Le quantità estratte coincidono con quelle del documento di esempio verificato
- [ ] Test sul comportamento esterno: su un Bando reale il Parse produce Item con quantità e unità coerenti e Flag per tutto ciò che non è stato capito
