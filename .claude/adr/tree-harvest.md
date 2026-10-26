# Tree harvest

## 001 — Scossa dell'albero con una molla smorzata sulla CPU, inclinazione rigida attorno alla base

- **Data:** 2026-10-26
- **Stato:** accettata. I parametri nella cartella di debug di ogni albero sono sostituiti il 2026-10-26 dalla [002](#002--parametri-della-scossa-condivisi-tilt-composto-con-la-rotazione-di-base).

### Contesto
Colpire un albero con l'ascia (azione `harvest`, vedi [interaction 001](interaction.md#001--interactable-posseduto-dallentità-interactionmanager-che-sceglie-il-focus-outline-a-inverted-hull-prompt-nella-hud)) non aveva nessun effetto visibile. Il primo riscontro richiesto è che l'albero si scuota a ogni colpo. Legna, foglie che cadono e abbattimento sono passi successivi.

Il modello (`tree_pineRoundA.glb`) è un'unica mesh con due primitive, tronco e chioma, con l'origine alla base del tronco. Geometria e materiali sono condivisi fra tutti i cloni del `LoaderManager`.

### Decisione
- **Molla smorzata in `Tree`:** l'inclinazione della cima è un vettore orizzontale (`#tiltX`, `#tiltZ`, in radianti) con la sua velocità. In `update()` segue `a = -ω²x - 2ζωv`, integrata con Eulero semi-implicito a sotto-passi fissi di 1/120 s, perché il delta può arrivare a 0,1 s ed è troppo grossolano per una molla rigida. A riposo l'albero smette di aggiornare la trasformazione.
- **Rotazione rigida attorno alla base:** si ruota la radice del modello (`this.object`) attorno all'asse `up × direzione`. L'origine è alla base, quindi non serve un pivot aggiuntivo. Posizione, collider e punto di focus non cambiano, e il guscio dell'outline, figlio delle mesh, segue la rotazione.
- **Direzione dal colpo:** ogni colpo aggiunge alla velocità un impulso (`hitImpulse`) nella direzione orizzontale dal player all'albero, quindi la cima si piega via dal player. I colpi ripetuti si sommano. `maxTilt` limita l'inclinazione: oltre il limite la si riproietta sul bordo e si toglie la velocità verso l'esterno. La posizione del player arriva da `onAction` (vedi [interaction 002](interaction.md#002--onaction-riceve-la-posizione-di-chi-agisce)).
- **Il collider resta dritto:** la scossa è solo visiva.
- **Parametri nella cartella debug dell'albero:** `shakeFrequency` (2,2 Hz), `shakeDamping` (rapporto di smorzamento 0,18), `hitImpulse` (1,2 rad/s, circa 5° di picco), `maxTilt` (0,15 rad). C'è anche un pulsante `hit` per provare la scossa senza l'ascia.

### Alternative scartate
- **Flessione nel vertex shader** (spostamento proporzionale all'altezza, base ferma e cima piegata): è più naturale, ma il materiale è condiviso fra tutti gli alberi. Servirebbero uniform per ogni istanza (`onBeforeRender`) oppure un clone del materiale per ogni albero, più un `customDepthMaterial` coerente per le ombre. Diventerà sensata se vegetazione e alberi dovranno ondeggiare anche col vento: allora la scossa potrà diventare un ingresso dello stesso shader.
- **Clip animata in Blender:** non si orienta secondo la direzione del colpo e non si somma ai colpi ripetuti.
- **Tween a tempo fisso** (una sinusoide smorzata che riparte a ogni colpo): un secondo colpo durante la scossa la farebbe ripartire di scatto. La molla conserva lo stato e somma gli impulsi in modo continuo.
- **Inclinare anche il collider:** il player sentirebbe il tronco spostarsi sotto di sé per pochi gradi di movimento, senza nessun vantaggio di gioco.

### Conseguenze
- Il tronco si inclina rigido e non si curva. Agli angoli usati, e con questo stile low-poly, si nota poco.
- Un albero a riposo non costa nulla per frame, a parte un controllo booleano. Un albero che oscilla costa al massimo 12 sotto-passi di poche moltiplicazioni.
- `Tree` usa ancora la rotazione di `this.object` per la scossa: se in futuro gli alberi avranno una rotazione propria (per esempio una rotazione casuale attorno a Y), la scossa dovrà comporsi con quella, oppure andare su un nodo figlio.

## 002 — Parametri della scossa condivisi, tilt composto con la rotazione di base

- **Data:** 2026-10-26
- **Stato:** accettata. Sostituisce, nella [001](#001--scossa-dellalbero-con-una-molla-smorzata-sulla-cpu-inclinazione-rigida-attorno-alla-base), i parametri e il pulsante nella cartella di debug di ogni albero, e risolve la conseguenza sulla rotazione propria degli alberi.

### Contesto
Con gli alberi generati nei chunk (vedi [world 004](world.md#004--alberi-casuali-nei-chunk-come-entità-tree-gestiti-da-forest)) ci sono decine di `Tree` caricati, ognuno con una rotazione casuale attorno a Y.

### Decisione
- I parametri stanno in un unico oggetto esportato `TREE_SHAKE` (`frequency`, `damping`, `impulse`, `maxTilt`), letto da tutti gli alberi e regolato dalla cartella di debug di `Forest`. `Tree` non ha più una cartella propria.
- `Tree.shake(from)` è pubblico, così il pulsante `shake all trees` può scuotere tutti gli alberi.
- La rotazione attorno a Y è salvata in `#baseRotation`. Il tilt si applica in spazio mondo prima di lei (`tilt × base`), quindi la direzione della scossa non dipende da come è girato il modello. A riposo la rotazione torna a quella di base.

### Alternative scartate
- **Una cartella di debug per albero:** con 75 alberi la GUI diventa illeggibile, e le cartelle si creerebbero e distruggerebbero a ogni cambio di chunk.
- **Rotazione di base su un nodo figlio:** servirebbe un nodo in più, e cambierebbe l'oggetto su cui si aggancia l'outline. Comporre i quaternioni costa una moltiplicazione e solo mentre l'albero oscilla.

### Conseguenze
- Non si possono più regolare i parametri di un singolo albero: per ora non serve.
