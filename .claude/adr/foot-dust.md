# Foot dust

## 001 — Particelle di polvere animate dalla GPU in un unico `Points`

- **Data:** 2026-10-24
- **Stato:** sostituita il 2026-10-24 dalla [002](#002--cubetti-di-terriccio-simulati-sulla-cpu-in-un-instancedmesh).

### Contesto
Si vuole della polvere che si alza dai piedi del player quando cammina, più intensa quando corre, senza pesare sulle prestazioni.

### Decisione
- Un'entità dedicata in `src/entities/FootDust/` (`FootDust.ts`, `vertex.glsl`, `fragment.glsl`) che riceve il player come `followed`, tipizzato con l'interfaccia minima `FootDustFollowed` (`object`, `isMoving`, `isRunning`, `isGrounded`). A questo scopo il `Player` espone `isGrounded`.
- Tutte le particelle stanno in un solo `THREE.Points` con 256 slot preallocati, cioè una sola draw call. Uno slot nuovo prende il posto della particella più vecchia (ring buffer).
- La CPU scrive solo le particelle che nascono: posizione e velocità iniziali, istante di nascita, durata, dimensione e tonalità. Carica sulla GPU solo gli slot cambiati (`addUpdateRange`).
- Il vertex shader calcola a ogni frame posizione (velocità con attrito esponenziale e una gravità leggera), dimensione e trasparenza a partire da `uTime`. Il fragment shader disegna un cerchio sfumato senza texture.
- L'emissione avviene solo a terra e in movimento, con un rate diverso per camminata e corsa. In più c'è uno sbuffo radiale all'atterraggio.
- Lo shader include i chunk di nebbia e di color space di three.js, così le particelle si comportano come il resto della scena.

### Alternative scartate
- **Un oggetto per particella:** una draw call ciascuna, lo stesso problema risolto per la vegetazione in [world.md](world.md).
- **Movimento calcolato sulla CPU:** bisognerebbe riscrivere e ricaricare tutte le posizioni a ogni frame. Con la formula nello shader si carica solo la nascita.
- **Texture per lo sprite:** un asset in più per una forma che si ottiene con una riga di shader.
- **Cubetti di terriccio con `InstancedMesh`:** più coerenti con lo stile voxel, ma per la polvere servono sprite morbidi. Si possono aggiungere più avanti come effetto separato.
- **Emissione a ogni appoggio del piede:** più fedele, ma richiede i tempi di contatto delle clip `Walk` e `Run`. Per ora l'emissione è continua e proporzionale allo stato.

### Conseguenze
- `frustumCulled` è disattivato: la posizione reale delle particelle la conosce solo lo shader. Costa poco, perché è un solo oggetto.
- Il costo principale è l'overdraw delle particelle trasparenti: dimensioni e rate vanno tenuti contenuti.
- Le particelle non proiettano né ricevono ombre.
- Con `?debug` si possono regolare rate, opacità, attrito e gravità.

## 002 — Cubetti di terriccio simulati sulla CPU in un `InstancedMesh`

- **Data:** 2026-10-24
- **Stato:** accettata. Sostituisce la [001](#001--particelle-di-polvere-animate-dalla-gpu-in-un-unico-points).

### Contesto
Gli sbuffi morbidi della 001 non convincevano dal punto di vista grafico. Si preferiscono piccoli cubi di terriccio, più coerenti con lo stile voxel del personaggio.

### Decisione
- `FootDust` resta un'entità a sé in `src/entities/FootDust/` con la stessa interfaccia `FootDustFollowed`. Gli shader custom sono stati rimossi.
- Le particelle sono cubi in un solo `InstancedMesh` (`BoxGeometry` e `MeshStandardMaterial`), quindi illuminati, con ombra proiettata e nebbia come il resto della scena. Un terzo circa sono zolle più grandi con il colore del terreno (`COLORS.ground`, luminosità leggermente variata), il resto sono granelli molto piccoli fra `COLORS.dirt` e `COLORS.sand`.
- La simulazione è sulla CPU: 128 particelle preallocate, gravità, rimbalzo smorzato sul terreno, attrito quando sono ferme, rotazione e rimpicciolimento finale. Ogni frame le particelle vive vengono compattate nelle prime `count` istanze.
- L'emissione è la stessa della 001: rate diverso per camminata e corsa, a terra e in movimento, più una raffica all'atterraggio.

### Alternative scartate
- **Animazione nello shader come nella 001:** rimbalzi e attrito sul terreno non si esprimono bene con una formula chiusa nel tempo, e servirebbe anche riscrivere l'illuminazione standard con `onBeforeCompile`.
- **Slot fissi con le istanze morte a scala zero:** la GPU elaborerebbe sempre tutte le 128 istanze. Compattare costa poco e disegna solo quelle vive.

### Conseguenze
- Il costo sulla CPU cresce con le particelle vive (decine, poche decine di microsecondi per frame). Con migliaia di particelle bisognerebbe tornare a una simulazione nello shader.
- I cubetti proiettano ombra: una draw call in più nel pass delle ombre.
- `frustumCulled` resta disattivato, perché le istanze si muovono a ogni frame.
- **Aggiornamento 2026-10-24:** `FootDust` non è più un'entità. Si trova in `src/particles/FootDust/` ed estende `InstancedParticles` del sistema di particelle descritto in [particles.md](particles.md). La sorgente si chiama `FootDustSource`.
