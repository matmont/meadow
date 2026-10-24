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
- **Nebbia:** `Fog(COLORS.sky, 30, 60)` in `main.ts`, con lo sfondo della scena dello stesso colore, nasconde il bordo del piano e la comparsa dei chunk. Le distanze sono legate fra loro: area caricata (almeno 64m dal player) > nebbia piena (60m dalla camera) e mezzo lato del piano (100m) > nebbia piena.

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
