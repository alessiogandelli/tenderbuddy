# 01: Contratto congelato + due alberi indipendenti avviabili

**What to build:** il contratto JSON del Bando esiste, è versionato e vale per entrambi i lati; `backend/` e `frontend/` si avviano da soli con uv, poetry e pip; la webapp mostra la versione del contratto e la raggiungibilità del backend. L'esempio golden fornito valida contro il contratto. È il prefactoring che rende facili tutte le altre mosse.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Il contratto JSON del Bando è documentato e versionato (schema + esempio golden) e le copie presenti nei due alberi coincidono
- [ ] Il backend si avvia da solo con uv, con poetry e con pip
- [ ] Il backend risponde a un controllo di stato che espone la versione del contratto
- [ ] Il frontend si avvia da solo e mostra versione del contratto e raggiungibilità del backend
- [ ] Il fixture golden fornito valida contro il contratto in un test automatico
- [ ] Nessuna dipendenza o import incrociato fra i due alberi
