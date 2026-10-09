# 11: Match → Catalogo + routing a preventivo fornitore

**What to build:** gli Item estratti si agganciano al Catalogo: Prodotto, Install Code, confidenza e sorgente del prezzo. Chi non trova corrispondenza esce `no_match` e si vede; chi è un Pacchetto fornitore esce `supplier_quote_required` e non riceve un prezzo inventato. Sul Bando completo il risultato è onesto: la quota prezzata è coperta, il resto è segnalato.

**Blocked by:** 05, 09

**Status:** ready-for-agent

- [ ] Ogni Item matchato espone Prodotto, Install Code, confidenza e sorgente del prezzo
- [ ] Un Item senza corrispondenza esce con Stato di mancato match, segnalato
- [ ] Un Pacchetto fornitore esce `supplier_quote_required`, senza prezzo inventato
- [ ] Il Match è rivedibile e sostituibile dall'utente
- [ ] Il Match usa gli attributi dell'Item (dimensione, tipo, classe di resistenza al fuoco), non la semplice corrispondenza di stringa
- [ ] Test sul comportamento esterno: sul Bando completo il Match copre una quota significativa degli Item e il resto è segnalato onestamente
