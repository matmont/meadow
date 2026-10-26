# World

## 001 — Prato infinito: piano che segue il player, collider half-space, vegetazione a chunk, nebbia

- **Data:** 2026-10-24
- **Stato:** accettata

### Contesto
Il terreno era un quadrato di 100m costruito a mano come griglia di quadrati da 3m con UV ruotati a caso, che servivano a nascondere la ripetizione di una texture. La texture non c'è più (il materiale è un colore pieno), e si vuole un prato senza fine, generato quando il player si avvicina al bordo.

### Decisione
- La cartella `src/entities/Ground/` diventa `src/entities/World/` e contiene `Ground.ts`, `Vegetation.ts` e `utils.ts`.
- **Terreno:** un solo `PlaneGeometry` di 200m che a ogni frame si sposta sotto il player (`followed`, come `Sun` e `FollowCamera`). Il colore è uniforme, quindi lo spostamento non si vede.
- **Fisica:** un collider `HalfSpace` di Rapier con normale `+Y`, cioè un piano infinito. Viene creato una volta e non si sposta.
- **Vegetazione:** `Vegetation` divide il mondo in chunk da 32m e tiene caricati quelli entro un raggio di 2 dal chunk del player (5×5). Ricalcola l'insieme solo quando il player cambia chunk. I chunk usciti dal raggio vengono staccati ma non distrutti, perché le piante condividono geometrie e materiali con i modelli in cache. (Dalla [002](#002--vegetazione-disegnata-con-instancedmesh) i chunk contengono solo posizioni, non oggetti.)
- **Generazione deterministica:** il seed di un chunk dipende solo dalle sue coordinate e da `WORLD_SEED`. Tornando in un punto si ritrovano le stesse piante senza salvare nulla. La densità per chunk (8 erbe, 4 fiori) è quella del vecchio quadrato da 100m.
- **Nebbia:** `Fog(COLORS.sky, 30, 60)` in `main.ts` (dal 2026-10-25 l'inizio è a 50m, per una fascia di foschia più sottile; vedi [day-night-cycle.md](day-night-cycle.md)), con lo sfondo della scena dello stesso colore, nasconde il bordo del piano e la comparsa dei chunk. Le distanze sono legate fra loro: area caricata (almeno 64m dal player) > nebbia piena (60m dalla camera) e mezzo lato del piano (100m) > nebbia piena.

### Alternative scartate
- **Terreno a chunk (una mesh e un collider per chunk):** necessario solo con rilievi o materiali diversi per zona. Su un piano piatto e uniforme aggiunge creazione e rimozione di mesh e collider senza differenze visibili.
- **Un cuboid enorme come collider, o un cuboid che segue il player:** l'half-space è infinito per definizione e non richiede aggiornamenti.
- **Distruggere e ricreare le risorse dei chunk:** le piante sono cloni con risorse condivise. Basta staccarle dalla scena.
- **Controllo dei chunk a ogni frame:** inutile. Il confronto con il chunk corrente costa due `Math.floor` e il lavoro vero avviene solo al cambio di chunk.
- **`InstancedMesh` per erba e fiori:** meno draw call, ma con circa 300 piante caricate non serve ancora. Da rivalutare se aumentano densità o raggio. **Rivalutata il 2026-10-24 nella [002](#002--vegetazione-disegnata-con-instancedmesh).**

### Conseguenze
- Cambiare `CHUNK_SIZE`, `CHUNK_RADIUS`, `PLANE_SIZE` o le distanze della nebbia richiede di ricontrollare le relazioni descritte sopra, altrimenti si vedono il bordo del piano o le piante che compaiono.
- Gli shader custom (per esempio `ShaderPlane`) ignorano la nebbia finché non includono i chunk di fog di three.js.
- Alberi e rocce sono ancora piazzati a mano in `main.ts`. Per distribuirli nei chunk servono anche i loro collider: andrà fatto con un nuovo ADR.
- La precisione dei float resta sufficiente finché il player non si allontana di decine di km dall'origine. Oltre servirebbe ricentrare il mondo.

## 002 — Vegetazione disegnata con `InstancedMesh`

- **Data:** 2026-10-24
- **Stato:** accettata. Sostituisce, nella [001](#001--prato-infinito-piano-che-segue-il-player-collider-half-space-vegetazione-a-chunk-nebbia), la parte sui chunk come gruppi di cloni.

### Contesto
Con il prato a chunk le piante caricate sono circa 430 mesh. Ognuna era un clone separato, quindi una draw call nella scena e una nel pass delle ombre. Dopo aver allargato il frustum delle ombre del `Sun` gli FPS sono scesi in modo visibile.

### Decisione
- `Vegetation` crea all'avvio un `InstancedMesh` per ogni mesh di ogni modello (per esempio un fiore ha due mesh: stelo e petali). Geometria e materiale sono quelli del modello in cache. La matrice della mesh dentro il modello, compresa la scala dell'asset, è salvata come `offset`.
- Un chunk contiene solo i suoi `Placement` (modello e matrice nel mondo), generati da `scatterModels` con il seed del chunk.
- A ogni cambio di chunk tutte le istanze vengono riscritte da zero (`placement × offset`) e viene ricalcolata la bounding sphere per il frustum culling. Succede raramente e costa poche centinaia di moltiplicazioni di matrici.
- La capacità di ogni `InstancedMesh` è `count del layer × numero di chunk caricati`, il massimo possibile.

### Alternative scartate
- **Slot fissi per chunk, aggiornando solo i chunk cambiati:** più veloce in teoria, ma serve gestire slot liberi e compattazione. Riscrivere tutto al cambio di chunk è già trascurabile.
- **`InstancedMesh` separati per ogni chunk:** le draw call scalerebbero con il numero di chunk invece che con il numero di modelli.
- **`BatchedMesh`:** utile con geometrie diverse e un solo materiale. Qui ogni modello ha materiali propri, e l'instancing per modello è più semplice.

### Conseguenze
- Le draw call della vegetazione dipendono solo da quante mesh hanno i modelli usati (oggi 22), non da quante piante ci sono. Aumentare densità o raggio costa memoria e vertici, non draw call.
- Le piante non sono più oggetti singoli nella scena: per interagire con una pianta (raccoglierla, tagliarla) bisognerà lavorare sul suo `Placement` e riscrivere le istanze.
- Il frustum culling vale per tutto l'`InstancedMesh`, non per la singola pianta: le istanze fuori schermo vengono comunque processate dalla GPU.

## 003 — Un solo falò come punto di riferimento della "casa" iniziale

- **Data:** 2026-10-25
- **Stato:** accettata

### Contesto
Si aggiunge il falò (`public/models/campfire/campfire.glb`): sassi, tronchi, braci, fiamme e scintille, la clip `Burn` che anima fiamme e scintille, e un nodo vuoto `FireLight` che indica dove mettere la luce. Il falò è uno solo: serve al giocatore per riconoscere il suo accampamento iniziale.

### Decisione
- Un'entità `Campfire` (`src/entities/Campfire.ts`), costruita come `Tree`: un clone del modello con `LoaderManager.instantiate()`, posizione e rotazione nel costruttore, un collider cilindrico fisso che copre sassi e tronchi.
- Un `AnimationMixer` sul clone riproduce `Burn` in loop.
- Una `PointLight` agganciata al nodo `FireLight`, con un tremolio uguale a quello della torcia. Di notte rende l'accampamento visibile da lontano.
- Fiamme, braci e scintille (materiali con emissive non nero) non proiettano e non ricevono ombre.
- `dispose()` non chiama `super.dispose()`: geometrie e materiali sono condivisi con il modello in cache.
- In `main.ts` il falò sta vicino all'albero, a pochi metri dal punto di partenza.

### Alternative scartate
- **`InstancedMesh` per i falò, come per la vegetazione:** utile solo con molti falò. Con uno solo aggiunge un template animato, la riscrittura delle istanze a ogni frame e una luce per falò da gestire a parte.

### Conseguenze
- Il falò costa circa 17 draw call più il pass delle ombre: trascurabile per un oggetto unico.
- Se in futuro servono molti falò (per esempio accampamenti sparsi nei chunk), andranno istanziati con un nuovo ADR, decidendo anche quante luci tenere accese.

## 004 — Alberi casuali nei chunk come entità `Tree`, gestiti da `Forest`

- **Data:** 2026-10-26
- **Stato:** accettata. Risolve il punto lasciato aperto nella [001](#001--prato-infinito-piano-che-segue-il-player-collider-half-space-vegetazione-a-chunk-nebbia) ("Alberi e rocce sono ancora piazzati a mano"), per gli alberi.

### Contesto
Gli alberi devono comparire in modo casuale e deterministico come erba e fiori. A differenza delle piante, però, ogni albero ha un collider, un `Interactable` (si colpisce con l'ascia) e uno stato proprio (la scossa, vedi [tree-harvest](tree-harvest.md)).

### Decisione
- **`ChunkGrid`** (`src/entities/World/chunks.ts`) raccoglie la logica dei chunk che prima stava in `Vegetation`: `CHUNK_SIZE`, `CHUNK_RADIUS`, `chunkSeed()` e il caricamento e scaricamento al cambio di chunk, con callback `load`/`unload`. `Vegetation` la usa con `unload` vuoto. Il seed della vegetazione non cambia (salt 0), quindi erba e fiori restano dove erano.
- **`Forest`** (`src/entities/World/Forest.ts`) è un'entità che segue il player (`followed`) e riceve l'`EntityManager` nel costruttore:
  - al caricamento di un chunk crea fino a 3 `Tree` con `entities.add()`;
  - allo scaricamento chiama `destroy()` sui suoi alberi, e la rimozione avviene nel passo differito dell'`EntityManager`;
  - in `onRemoved()` svuota la griglia, quindi distrugge anche gli alberi rimasti.
- **Generazione:** seed del chunk con un salt proprio (`FOREST_SALT`), così gli alberi non riusano la sequenza dell'erba. Ogni albero ha modello (7 modelli, pini scuri e alberi verdi), posizione, rotazione attorno a Y e scala (0,8–1,25) casuali. Si estraggono sempre tutti i valori di un candidato, anche quando viene scartato, così il contenuto dipende solo dalle coordinate del chunk.
- **Distanze:** almeno 6 m fra due tronchi. Gli alberi stanno a mezza distanza minima dai bordi del chunk, quindi la regola vale anche fra chunk vicini. Un candidato troppo vicino si riestrae fino a 8 volte, poi l'albero si salta. Entro 10 m dall'origine non ci sono alberi casuali: lì ci sono il punto di partenza, il falò e l'albero piazzato a mano in `main.ts`, che resta.
- **`Tree`** accetta `model`, `rotation` e `scale` come opzioni. Misura il collider prima di applicare la rotazione.
- I parametri della scossa sono condivisi (`TREE_SHAKE`) e stanno nella cartella di debug di `Forest`, insieme al pulsante `shake all trees`. Così con `?debug` non compare una cartella per ogni albero.

### Alternative scartate
- **Alberi in `InstancedMesh` come la vegetazione**, con collider e interactable a parte: meno draw call, ma la scossa diventerebbe una riscrittura della matrice dell'istanza, e collider, focus e outline andrebbero gestiti fuori da un'entità (l'outline oggi salta le `InstancedMesh`). Con circa 75 alberi caricati il costo delle entità è accettabile. Da rivalutare se la densità cresce molto.
- **Alberi aggiunti come figli di `Forest` senza `EntityManager`:** `Forest` dovrebbe richiamare a mano `onAdded`, `update`, `onRemoved` e `dispose` di ogni albero, duplicando il ciclo di vita.
- **`Ground` o `Vegetation` che generano anche gli alberi:** `Ground` ha già terreno, collider e colonna sonora, e `Vegetation` non è un'entità. Una classe separata tiene distinti il disegno delle piante e il ciclo di vita delle entità.
- **Distanza minima solo dentro il chunk:** due alberi su lati opposti di un bordo potrebbero toccarsi. Il margine dal bordo lo evita senza dover guardare i chunk vicini.

### Conseguenze
- Con 3 alberi per chunk e 25 chunk caricati ci sono fino a 75 alberi: circa 150 draw call in più (2 mesh per modello), 75 corpi fissi in Rapier e 75 interactable valutati a ogni frame dall'`InteractionManager`. Il pass delle ombre ne vede solo pochi, perché il frustum del `Sun` è stretto.
- Al cambio di chunk si creano fino a 15 alberi nello stesso frame (clone del modello, `Box3`, corpo Rapier). Se diventasse un picco visibile, la creazione si potrà distribuire su più frame.
- `Forest` è la prima entità che crea altre entità: lo fa tramite l'`EntityManager` ricevuto nel costruttore, e chi crea distrugge.
- Lo stato degli alberi (scossa, e in futuro legna o abbattimento) si perde quando il loro chunk viene scaricato: tornando, l'albero è di nuovo intatto. Per ricordare gli alberi abbattuti servirà salvare uno stato per chunk.
- Erba e fiori possono ancora crescere vicino a un tronco, perché le due generazioni non si conoscono.
