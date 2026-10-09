# From Tender to First Price

Trasforma un **Bando** (documento di gara) in un **Preventivo** leggibile e difendibile: si carica il PDF, il motore estrae gli item, li aggancia ai dati di prezzatura e produce costi, prezzo indicativo e fascia di offerta, segnalando esplicitamente tutto ciò che non è stato capito.

## Language

### Documento

**Bando**:
Un documento di gara pubblicato da un committente, unità di lavoro dell'app: ha titolo, descrizione, classificazione e un proprio Preventivo.
_Avoid_: pratica, progetto, richiesta

**Titolo**:
Il nome in una riga con cui il Bando si riconosce a colpo d'occhio nell'archivio.
_Avoid_: nome, label, intestazione

**Descrizione**:
Il riassunto breve di cosa tratta il Bando, ad esempio "Sistema di ventilazione".
_Avoid_: abstract, nota, sommario

**Classificazione**:
Il tipo/ambito rilevato per il Bando, che seleziona il Profilo di prezzatura.
_Avoid_: categoria, tag, dominio

**Pagina sorgente**:
La pagina del PDF del Bando da cui un Item è stato estratto.
_Avoid_: riferimento, ref, fonte

**Tracciabilità**:
Il legame fra un numero del Preventivo e la regione esatta del PDF da cui proviene.
_Avoid_: audit trail, provenienza

### Estrazione

**Item**:
Un'unità prezzabile estratta dal Bando, o creata a mano: descrizione, quantità, unità, attributi.
_Avoid_: riga, entry, record

**Unità**:
La misura di un Item, normalizzata (`pc`, `m`, `m2`, `h`, `LS`, `system`).
_Avoid_: UoM, misura, unit of measure

**Attributo**:
Una caratteristica tecnica usata per il Match (dimensione, DN, classe di resistenza al fuoco).
_Avoid_: proprietà, feature, campo

**Flag di incertezza**:
Il marcatore che registra ciò che non è stato capito o che manca in un Item.
_Avoid_: warning, alert, errore

**Stato**:
La condizione di revisione/prezzatura di un Item (`calculated`, `supplier_quote_required`, `assumption_applied`, `review_required`, `insufficient_information`, `out_of_scope`, `non_priceable`).
_Avoid_: status del record, fase

**Copertura**:
Quanta parte del Bando è prezzata rispetto a quanto resta da sistemare.
_Avoid_: completamento, percentuale di avanzamento

### Dati di prezzatura

**Catalogo**:
L'elenco curato di Prodotti e Pacchetti fornitore contro cui si prezza.
_Avoid_: listino, anagrafica, magazzino

**Prodotto**:
Una voce di Catalogo con costo netto e Install Code.
_Avoid_: articolo, componente, articolo di listino

**Pacchetto fornitore**:
Una voce di Catalogo che non possiamo prezzare e che richiede un preventivo del fornitore.
_Avoid_: voce da quotare, esterno

**Match**:
L'assegnazione di un Item a un Prodotto, con una confidenza.
_Avoid_: associazione, mapping, corrispondenza

**Install Code**:
La chiave che lega un Item alla relativa Regola di produttività.
_Avoid_: codice lavoro, work type

**Regola di produttività**:
Le ore base per unità e il ruolo di manodopera per un Install Code.
_Avoid_: tabella ore, tariffa oraria

**Parametri di progetto**:
I fattori, le maggiorazioni e le condizioni commerciali specifici del progetto.
_Avoid_: config, settings, parametri globali

**Profilo di prezzatura**:
L'insieme di Catalogo, Regole di produttività e Parametri di progetto applicato a un Bando.
_Avoid_: dataset, bundle, configurazione di pricing

### Prezzo

**Costo materiale**:
Il costo dei materiali di un Item, maggiorato della percentuale di scarto.
_Avoid_: costo articoli

**Costo manodopera**:
Il costo dell'installazione di un Item, ore regolate per tariffa.
_Avoid_: costo ore, costo posa

**Costo diretto**:
La somma di costo materiale e costo manodopera di un Item o del Bando.
_Avoid_: costo di cantiere, break-even

**Cost Baseline**:
La base di costo del Bando: costo diretto maggiorato di overhead e trasporto/equipaggiamento. È la base da cui si calcola la fascia di offerta.
_Avoid_: costo base, break-even, costo di progetto

**Margine**:
La percentuale di margine target usata per determinare il prezzo di vendita.
_Avoid_: ricarico (è markup, concetto diverso), utile

**Prezzo indicativo**:
Il prezzo di vendita calcolato dal Cost Baseline e dal Margine.
_Avoid_: prezzo finale, quotazione

**Fascia di offerta**:
I tre Scenari (Aggressive, Target, Conservative) con prezzo, margine, probabilità stimata di aggiudicazione e contributo atteso.
_Avoid_: range prezzi, bracket

**Scenario**:
Una delle tre ipotesi di offerta che combina margine e probabilità di aggiudicazione.
_Avoid_: opzione, alternativa

**Preventivo**:
Il risultato prezzato di un Bando: item prezzati, sintesi, prezzo indicativo e Fascia di offerta.
_Avoid_: offerta, quotazione, proposal

### Prodotto software

**Motore di estrazione**:
Il componente che legge il PDF e produce Item; dietro interfaccia, con implementazioni intercambiabili.
_Avoid_: parser, reader, engine di lettura
