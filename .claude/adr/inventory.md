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

## 002 — L'`Inventory` possiede la sua cartella di debug

- **Data:** 2026-10-27
- **Stato:** accettata

### Contesto
Con `?debug` serve una cartella "Inventory" con un pulsante per aggiungere 1 di ogni risorsa, per provare a mano la HUD (vedi [hud-ui 003](hud-ui.md)) finché nessun gameplay raccoglie pietra e funghi. La prima versione la creava in `main.ts`, separata dallo stato che modifica.

### Decisione
- Il constructor di `Inventory` crea la cartella con `DebugManager.createFolder("Inventory", …)`, come `AudioManager` fa con la sua: chi possiede lo stato possiede anche i controlli di debug.
- `Inventory.dispose()` distrugge la cartella. `main.ts` la chiama nel cleanup HMR prima di `DebugManager.dispose()`, così dopo un reload resta una sola cartella.
- Il test unitario di `Inventory` resta nell'ambiente `node` e sostituisce `DebugManager` con `vi.mock`, perché `DebugManager` legge `location` quando viene importato. La cartella è coperta da `tests/integration/inventory-debug.test.ts` con happy-dom e `?debug`.

### Alternative scartate
- **Cartella creata in `main.ts`:** lascia a `main.ts` un pezzo di logica dell'inventario e un riferimento da distruggere a mano; ogni altra istanza (per esempio nei test) non avrebbe i suoi controlli.
- **Rendere `DebugManager.isEnabled` sicuro senza `location`:** cambierebbe codice di produzione solo per i test.
- **Spostare il test unitario di `Inventory` su happy-dom:** rallenta un test di logica pura e nasconde dipendenze involontarie dal DOM.

### Conseguenze
- `Inventory` ha un lifecycle: chi crea un'istanza con `?debug` attivo deve chiamare `dispose()` una sola volta (lil-gui non tollera un doppio `destroy()` della stessa cartella).
- Importare `Inventory` porta con sé `DebugManager` e `lil-gui`: i test in ambiente `node` che lo importano devono sostituire `DebugManager`.
