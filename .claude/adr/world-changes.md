# World changes

## 001 — Registro `WorldChanges` delle rimozioni di oggetti generati, con chiave stabile e tempo di gioco

- **Data:** 2026-10-26
- **Stato:** accettata

### Contesto
Il mondo è generato in modo deterministico per chunk (`ChunkGrid`, `chunkSeed()` in `src/entities/World/chunks.ts`): tornando in un punto si ritrovano gli stessi oggetti senza salvare nulla (vedi [world 001](world.md#001--prato-infinito-piano-che-segue-il-player-collider-half-space-vegetazione-a-chunk-nebbia) e [world 004](world.md#004--alberi-casuali-nei-chunk-come-entità-tree-gestiti-da-forest)). La conseguenza, già annotata nella world 004, è che lo stato degli oggetti si perde quando il chunk viene scaricato. Con l'abbattimento degli alberi un albero tagliato ricomparirebbe intatto appena il player si allontana e torna. Serve ricordare le modifiche fatte dal player agli oggetti generati, e il momento in cui sono avvenute, per far poi ricrescere gli alberi dopo un tempo configurabile.

### Decisione
- `src/WorldChanges.ts` esporta `worldKey(layer, chunkX, chunkZ, index)` e la classe `WorldChanges` come default export. Non dipende da three.js né da Rapier.
- **Chiave stabile:** `worldKey` identifica un oggetto generato con il nome del layer (per esempio `"forest"`), le coordinate del chunk e l'indice dell'oggetto nell'ordine di generazione del chunk. La generazione dipende solo dalle coordinate, quindi lo stesso oggetto riceve la stessa chiave a ogni ricaricamento. Vale anche per oggetti piazzati a mano, con un layer proprio (per esempio `worldKey("camp", 0, 0, 0)`).
- La chiave è una stringa `layer:x,z,indice`. I numeri devono essere interi sicuri (l'indice anche non negativo) e il layer non vuoto, altrimenti `RangeError`. Gli interi non contengono `:`, quindi la parte dopo l'ultimo `:` è sempre quella numerica: chiavi diverse per coordinate a più cifre, coordinate negative e layer qualsiasi. La stringa si costruisce solo al caricamento del chunk o alla rimozione, mai a ogni frame.
- **API minima:** `markRemoved(key, time)` registra la rimozione al tempo di gioco `time` (l'`elapsed` dell'`Engine`, in secondi; deve essere finito e non negativo, altrimenti `RangeError`) e una seconda rimozione sovrascrive il tempo; `removedAt(key)` restituisce quel tempo, o `undefined` se l'oggetto è nel suo stato generato; `restore(key)` lo riporta allo stato generato.
- **Politica di ricrescita fuori dal registro:** chi usa il registro confronta `elapsed - removedAt(key)` con il proprio ritardo e chiama `restore()`. Così il ritardo si può cambiare dal pannello di debug e vale subito anche per i ceppi già esistenti.
- È un'istanza creata in `main.ts` e passata nel constructor a chi genera oggetti (per prima `Forest`), come `Inventory` (vedi [inventory 001](inventory.md)).
- Lo stato vale solo per la sessione: nessuna persistenza, il ricaricamento della pagina riporta il mondo allo stato generato.

### Alternative scartate
- **Salvare nel registro il tempo di ricrescita ("ricresce a") invece del tempo di rimozione:** il ritardo verrebbe fissato al momento del taglio, e cambiarlo dal pannello di debug non avrebbe effetto sui ceppi esistenti. Inoltre il registro dovrebbe conoscere una politica che appartiene al gameplay.
- **Stato sull'entità (`Tree`):** l'entità viene distrutta quando il chunk viene scaricato, quindi lo stato si perderebbe proprio nel caso che si vuole gestire.
- **Manager statico (`WorldChangesManager`):** come per l'inventario, i manager statici sono riservati ai servizi dell'applicazione. Il registro è stato di gioco; un'istanza rende esplicite le dipendenze e nei test si crea da zero senza reset globali.
- **Persistenza in `localStorage` subito:** non richiesta ora. Richiederebbe versioning dei dati e un legame con `WORLD_SEED` e con l'ordine di generazione, che oggi possono cambiare liberamente. Da decidere con un nuovo ADR, insieme alla persistenza dell'inventario.
- **Chiave basata sulla posizione nel mondo (coordinate arrotondate):** fragile con i float e con oggetti vicini fra loro; l'indice nell'ordine di generazione è esatto ed è già deterministico.
- **Set di chiavi senza tempo:** basterebbe per l'abbattimento, ma non per la ricrescita.

### Conseguenze
- La chiave dipende dall'ordine di generazione del chunk: cambiare `WORLD_SEED`, i salt, la densità o l'algoritmo di generazione di un layer cambia il significato degli indici. Senza persistenza non è un problema; con la persistenza andrà gestito.
- Gli oggetti di un chunk vanno numerati sempre nello stesso ordine, anche quando un candidato viene scartato (come già fa `Forest`, che estrae sempre tutti i valori di un candidato).
- Le voci rimosse restano nella mappa finché non vengono ripristinate: la memoria cresce con il numero di oggetti modificati nella sessione, non con l'area esplorata.
- Con l'HMR di `main.ts` l'istanza viene ricreata e il mondo torna allo stato generato, coerente con lo stato di sola sessione.
- Per ora registra solo rimozioni. Altri tipi di modifica (oggetti spostati o aggiunti) richiederanno di estendere l'API con un nuovo ADR.
