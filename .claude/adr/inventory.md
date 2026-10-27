# Inventory

## 001 — `Inventory` come istanza creata in `main.ts` e passata a chi la usa, stato solo di sessione

- **Data:** 2026-10-26
- **Stato:** accettata

### Contesto
Il player raccoglierà risorse (legna abbattendo gli alberi, poi pietra e funghi) e la HUD dovrà mostrarne il conteggio. Serve un proprietario unico di questo stato: chi raccoglie lo aggiorna, la UI lo legge senza copiarlo (vedi [hud-ui 001](hud-ui.md)). Per ora non esistono spese, crafting o salvataggi.

### Decisione
- `src/Inventory.ts` esporta il tipo `ResourceId` (`"wood" | "stone" | "mushroom"`), `RESOURCE_IDS` (ordine di visualizzazione) e la classe `Inventory` come default export.
- L'API è minima: `add(resource, amount = 1)`, che accetta solo interi positivi e lancia `RangeError` altrimenti, e `count(resource)`, che restituisce 0 per le risorse mai aggiunte.
- I conteggi sono numeri semplici, così la HUD li lega con `bind()` come primitivi, senza allocazioni per frame.
- È un'istanza, non un manager statico: `main.ts` la crea e la passa nel constructor a chi aggiunge (foresta/alberi) e a chi legge (HUD), tipizzata dove serve come interfaccia minima.
- Lo stato vale solo per la sessione: nessuna persistenza, si azzera al ricaricamento della pagina.
- Nessuna API di rimozione o spesa finché non serve.

### Alternative scartate
- **Manager statico (`InventoryManager`):** i manager statici sono riservati ai servizi globali dell'applicazione (input, fisica, audio, debug, UI). L'inventario è stato di gioco; un'istanza esplicita rende chiare le dipendenze e si crea da zero nei test senza reset globali.
- **Campo su `Player`:** foresta e HUD dovrebbero dipendere da `Player` solo per arrivare all'inventario, e `Player` diventerebbe proprietario di uno stato che non gestisce.
- **Persistenza (`localStorage`):** non richiesta ora; aggiungerebbe versioning e migrazione dei dati. Da decidere con un nuovo ADR quando servirà.

### Conseguenze
- Chi raccoglie risorse deve ricevere l'istanza nel constructor; `main.ts` resta il punto in cui viene creata e collegata.
- Aggiungere una risorsa significa estendere `ResourceId`, `RESOURCE_IDS` e il conteggio iniziale in `Inventory`.
- Con l'HMR di `main.ts` l'istanza viene ricreata e i conteggi ripartono da zero, coerente con lo stato di sola sessione.
