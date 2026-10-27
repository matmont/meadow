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

## 003 — Abbattimento dopo N colpi, ceppo, legna e stato in `WorldChanges`, gestiti da `Forest`

- **Data:** 2026-10-26
- **Stato:** accettata. Estende la [002](#002--parametri-della-scossa-condivisi-tilt-composto-con-la-rotazione-di-base) con i parametri dell'abbattimento e risolve, per gli alberi, la conseguenza della [world 004](world.md#004--alberi-casuali-nei-chunk-come-entità-tree-gestiti-da-forest) sullo stato perso allo scaricamento del chunk. L'aggancio per la ricrescita è realizzato il 2026-10-26 dalla [004](#004--ricrescita-degli-alberi-abbattuti-dopo-un-ritardo-configurabile-decisa-da-forest).

### Contesto
Colpire un albero con l'ascia lo scuoteva soltanto. Ora, dopo un certo numero di colpi, l'albero deve cadere, sparire e lasciare un ceppo, e il player deve ricevere legna nell'`Inventory` della sessione (vedi [inventory](inventory.md)). L'abbattimento deve sopravvivere allo scaricamento del chunk, tramite il registro `WorldChanges` (vedi [world-changes 001](world-changes.md)). La ricrescita è il passo successivo e qui va solo preparata.

### Decisione
- **Parametri condivisi:** `TREE_FELLING` (`hits` 5, `wood` 3, `fallDuration` 1,4 s), esportato da `Tree.ts` accanto a `TREE_SHAKE` e regolato dalla stessa cartella di debug di `Forest`.
- **Colpi in `Tree`:** ogni colpo incrementa un contatore e scuote l'albero; il colpo che raggiunge `hits` non lo scuote ma lo abbatte. Il contatore vive nell'entità, quindi un albero colpito e non abbattuto torna intatto se il chunk viene ricaricato.
- **Caduta:** riusa l'inclinazione della scossa (rotazione rigida attorno alla base, composta con la rotazione di base), con direzione orizzontale dal player all'albero. L'angolo va da zero a `FALL_ANGLE` (poco meno di 90°, così la chioma non affonda troppo nel terreno) con `fallEase(t) = t²`, cioè accelerazione angolare costante, in funzione del tempo accumulato dai `delta`. L'inclinazione al momento del colpo si dissolve nella stessa curva, quindi un albero colpito mentre oscilla non salta.
- **Durante la caduta** l'`Interactable` è disabilitato (`isEnabled`), i colpi sono ignorati e il corpo Rapier viene rimosso subito, così il player non urta un tronco invisibile. A fine caduta l'albero chiama `destroy()` su di sé (rimozione differita) e poi `onFallen`.
- **`Tree` non conosce inventario né registro:** espone `onFelled` (al colpo che abbatte) e `onFallen` (a fine caduta) come opzioni del costruttore. `Forest` li usa per registrare `worldChanges.markRemoved(key, elapsed)`, aggiungere la legna e, a fine caduta, sostituire l'albero con il ceppo. Registro e legna si aggiornano al colpo e non a fine caduta: se il chunk si scarica mentre l'albero cade, al ritorno c'è il ceppo e la legna non va persa. `elapsed` è quello dell'ultimo `update()` di `Forest`, perché il colpo arriva dall'evento `toolHit` del player.
- **`Stump`** (`src/entities/Stump.ts`) è un'entità con il modello clonato dal `LoaderManager` (`stumpOld` per i pini, `stumpRound` per gli alberi verdi), stessa posizione, rotazione e scala dell'albero più un fattore per modello che adatta il ceppo alla larghezza del tronco, un collider fisso a cilindro e nessuna interazione. Come `Tree` non chiama `super.dispose()` (geometrie e materiali condivisi) e rimuove il proprio corpo Rapier.
- **Slot in `Forest`:** ogni chunk contiene un array di voci `{ key, x, z, model, rotation, scale, tree, stump }`, una per albero accettato, con `key = worldKey("forest", chunkX, chunkZ, indice)` e l'indice contato fra gli alberi accettati in ordine di generazione. Le estrazioni casuali non cambiano. Al caricamento, se `removedAt(key)` è definito si crea il ceppo invece dell'albero; allo scaricamento si distrugge quello che la voce contiene.
- **Albero del campo:** passa da `main.ts` a `Forest`, come voce con layer proprio (`worldKey("camp", 0, 0, 0)`) creata in `onAdded()` e distrutta in `onRemoved()`, così si abbatte come gli altri.
- **Aggancio per la ricrescita:** la voce conserva tutto quello che serve a ricreare l'albero. Un passo in `Forest.update()` potrà confrontare `elapsed - removedAt(key)` con un ritardo configurabile per le voci con un ceppo, distruggere il ceppo, chiamare `restore(key)` e ricreare l'albero con lo stesso spec.

### Alternative scartate
- **Legna e registro gestiti da `Tree`:** l'albero dovrebbe conoscere la propria chiave, l'inventario e il registro, e il ceppo dovrebbe crearlo un'entità che sta per essere distrutta. `Forest` crea e distrugge già gli alberi, quindi possiede anche il ceppo.
- **Lo stesso `Tree` che cambia modello in ceppo:** collider, `Interactable` e outline andrebbero ricostruiti su un'entità con un altro scopo, e la ricrescita dovrebbe fare il percorso inverso. Due entità con un'unica voce che le alterna sono più semplici.
- **Corpo Rapier dinamico per la caduta:** caduta fisica più credibile, ma servirebbero un collider della chioma, un giunto o un vincolo alla base, e lo stato fisico durante lo scaricamento del chunk. Un'animazione a tempo basta per un albero che sparisce subito dopo.
- **Disabilitare il collider invece di rimuovere il corpo:** il corpo non serve più dopo il colpo, e rimuoverlo subito evita un caso in più in `dispose()`.
- **Contatore dei colpi in `WorldChanges`:** il registro tiene solo le rimozioni; ricordare colpi parziali non è richiesto.

### Conseguenze
- `Forest` riceve `Inventory` e `WorldChanges` nel costruttore, tipizzati come viste minime (`ForestInventory`, `ForestWorldChanges`).
- L'albero cade attraverso gli oggetti vicini e il terreno senza collisioni: è solo visivo e sparisce a fine caduta.
- Al caricamento di un chunk con alberi abbattuti si creano ceppi invece di alberi: costo minore (un clone e un corpo fisso, nessun interactable).
- I colpi parziali e le oscillazioni si perdono allo scaricamento del chunk, come prima.

## 004 — Ricrescita degli alberi abbattuti dopo un ritardo configurabile, decisa da `Forest`

- **Data:** 2026-10-26
- **Stato:** accettata. Realizza l'aggancio per la ricrescita preparato nella [003](#003--abbattimento-dopo-n-colpi-ceppo-legna-e-stato-in-worldchanges-gestiti-da-forest).

### Contesto
Un albero abbattuto lascia un ceppo per sempre. Gli alberi devono ricrescere dopo un ritardo di tempo di gioco, e il ritardo deve essere configurabile. `WorldChanges` registra solo il momento della rimozione (`removedAt`) e lascia la politica a chi lo usa (vedi [world-changes](world-changes.md)).

### Decisione
- **Parametri condivisi:** `TREE_REGROWTH` (`delay` 300 s, `growDuration` 1,5 s), esportato da `Tree.ts` accanto a `TREE_SHAKE` e `TREE_FELLING` e regolato dalla stessa cartella di debug di `Forest`. Entrambi in secondi di tempo di gioco (`elapsed` dell'engine).
- **Ritardo letto a ogni controllo:** una voce è pronta quando `isRegrowthDue(removedAt, elapsed, delay)`, cioè `elapsed - removedAt >= delay`. Il registro conserva l'istante della rimozione e non una scadenza, quindi cambiare il ritardo dalla GUI vale subito anche per i ceppi già presenti.
- **Passo per frame su una lista di ceppi:** `Forest` tiene `#stumps`, le voci caricate che contengono un ceppo (aggiunte in `#plantStump`, tolte con swap-remove alla ricrescita e allo scaricamento). `update()` scorre solo quella lista, legge un numero dal registro e non alloca. Senza ceppi caricati il costo è nullo.
- **Ricrescita mentre il chunk è caricato:** il ceppo viene distrutto (rimozione differita), la chiave torna allo stato generato con `restore(key)` e la voce riceve un nuovo `Tree` con l'opzione `grow`. L'albero nasce con il collider già a piena grandezza e la scala del modello al 5%, che cresce fino al 100% in `growDuration` con `growEase(t) = 1 - (1 - t)³` (ease-out cubico), in funzione del tempo accumulato dai `delta`. Durante la crescita l'`Interactable` è disabilitato.
- **Il player non resta intrappolato:** se l'oggetto seguito è entro il raggio del collider dell'albero più un margine (`REGROWTH_MARGIN`, 0,5 m: il raggio della capsula del player più un po' di gioco), la ricrescita aspetta che si allontani. Il raggio non scalato di ogni modello si misura una volta, al primo bisogno, con `treeColliderRadius()` (clona il modello e ne misura il box come il costruttore di `Tree`) e resta in cache nell'istanza di `Forest`.
- **Ricrescita al caricamento:** se una voce ha una rimozione più vecchia del ritardo, `#spawn` chiama `restore(key)` e crea direttamente l'albero, senza animazione: nessuno lo stava guardando.
- **Un albero ricresciuto è un albero normale:** stessa voce, stesse callback, quindi si abbatte di nuovo (nuovo `markRemoved`) e dà di nuovo legna.
- **Debug:** cursori `regrowth delay` (0–900 s) e `grow duration`, più un pulsante `regrow all stumps now` che fa ricrescere subito tutti i ceppi caricati, sempre rispettando il controllo sul player.

### Alternative scartate
- **Scadenza salvata nel registro** (`markRemoved(key, elapsed + delay)`): cambiare il ritardo non varrebbe per i ceppi esistenti, e `WorldChanges` dovrebbe conoscere la politica di ricrescita.
- **Timer nell'entità `Stump`:** si perderebbe allo scaricamento del chunk, e il ceppo dovrebbe sapere come ricreare l'albero. La voce di `Forest` ha già tutto.
- **Scorrere tutti i chunk caricati a ogni frame:** con 25 chunk e circa 75 voci non è caro, ma la lista dei ceppi è vuota quasi sempre e costa ancora meno.
- **Collider che cresce con l'albero:** servirebbe ricreare il collider a ogni frame dell'animazione; il controllo sulla posizione del player basta a evitare che resti incastrato.
- **Ricrescita forzata anche sotto il player dal pulsante di debug:** comodo, ma intrappolerebbe il player proprio nel caso che il controllo vuole evitare.

### Conseguenze
- `ForestWorldChanges` include anche `restore`.
- Un ceppo sotto il player ricresce appena il player si sposta, anche se il ritardo è passato da molto: non c'è un secondo ritardo.
- Il raggio usato per il controllo è quello del collider di `Tree` (il lato minore del box dell'intero modello), più largo del tronco: il player deve allontanarsi di qualche metro dal ceppo.
- La prima ricrescita di ogni modello clona il modello una volta per misurarlo.
