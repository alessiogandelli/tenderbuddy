# 03: Dettaglio Bando → Preventivo (golden al centesimo)

**What to build:** apro un Bando e vedo gli Item in tabella con descrizione, quantità, unità, Prodotto agganciato e Pagina sorgente; per ciascuno costo materiale, costo manodopera e costo diretto; la sintesi del progetto con Cost Baseline; il Prezzo indicativo con il Margine; e le tre card della Fascia di offerta. Un test golden garantisce che i 22 verificati riproducano l'output atteso esattamente.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Tabella Item con descrizione, quantità, unità, Prodotto agganciato e Pagina sorgente
- [ ] Per ogni Item: costo materiale, costo manodopera, costo diretto
- [ ] Sintesi del progetto e Cost Baseline calcolati secondo i numeri golden, esclusi i costi di progetto che il README inserisce ma che la ground truth non include
- [ ] Prezzo indicativo con il Margine
- [ ] Tre card della Fascia di offerta (Aggressive, Target, Conservative) con prezzo, margine, probabilità stimata di aggiudicazione e contributo atteso
- [ ] Test golden: i 22 verificati riproducono l'output atteso al centesimo, con la win-probability non arrotondata nel contributo atteso
