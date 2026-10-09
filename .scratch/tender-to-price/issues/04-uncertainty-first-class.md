# 04: Incertezza di prima classe

**What to build:** ogni Item porta Stato, confidenza e Flag di incertezza. Il pannello "da rivedere" elenca tutto ciò che è dubbio o mancante con conteggio e colore, e il report di Copertura dice quanto del Bando è prezzato rispetto a quanto resta da sistemare. Da lì si apre e si corregge l'Item segnalato. Nulla di non capito resta nascosto.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Ogni Item espone Stato e confidenza, nel contratto e nell'interfaccia
- [ ] I Flag di incertezza fanno parte del contratto e non possono sparire silenziosamente in un refactoring
- [ ] Il pannello "da rivedere" aggrega i Flag con conteggio e colore
- [ ] Report di Copertura distinto per calcolato, da preventivo fornitore, da rivedere, fuori ambito
- [ ] Ogni Item segnalato è apribile e correggibile dal pannello
- [ ] Test sul comportamento esterno: gli Item ambigui o incompleti tornano con il giusto Stato e i giusti Flag, e i totali di Copertura tornano
