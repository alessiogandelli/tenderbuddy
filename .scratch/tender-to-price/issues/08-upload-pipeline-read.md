# 08: Upload + pipeline a step + Read

**What to build:** carico il PDF di un Bando e nasce una voce in archivio. La pipeline gira step per step con lo stato visibile, così si vede che il processo è vivo e dove è arrivato. Il primo step legge il documento e ne estrae il testo per pagina, tramite un Motore di estrazione intercambiabile.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Upload di un PDF con creazione di un Bando in archivio
- [ ] La pipeline gira step per step con stato visibile nella webapp
- [ ] Il Read estrae il testo per pagina
- [ ] Il Motore di estrazione è dietro interfaccia, con almeno due implementazioni sostituibili
- [ ] Sostituire il Motore non tocca né il pricing né l'interfaccia
- [ ] Test sul comportamento esterno: l'upload porta a un Bando con stato di pipeline e testo per pagina
