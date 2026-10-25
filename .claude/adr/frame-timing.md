# Frame timing

## 001 — Delta limitato a [0, 0,1 s] nell'`Engine`, `elapsed` come somma dei delta limitati

- **Data:** 2026-10-25
- **Stato:** accettata

### Contesto
Al primo caricamento a freddo il player a volte finiva sotto il terreno appena partito il gioco. Un log dei primi frame lo ha spiegato:
- **Primo frame:** delta di circa **−1,8 s**. `Timer.reset()` (chiamato in `Engine.start()`) legge `performance.now()`, mentre `Timer.update()` riceve il timestamp di `requestAnimationFrame`, cioè l'inizio del frame. Se il main thread era occupato (caricamento degli asset, compilazione degli shader), quel timestamp può essere precedente al reset.
- **Effetto sul player:** in `Player.#move()` la gravità per un delta negativo dà una velocità verticale positiva (+17,9 m/s). Moltiplicata di nuovo per il delta negativo, diventa uno spostamento di −32 m in un solo passo.
- **Perché non viene fermato:** il collider del terreno non è ancora nelle query di Rapier, che si aggiornano solo con il primo `world.step()`, quindi il character controller non trova nulla. Il player resta sotto il piano, considerato "a terra".
- **Frame successivi:** alcuni durano più di 1 s, perché il primo render compila gli shader.

Il problema c'era già prima di [interaction 001](interaction.md); si notava soprattutto in Chrome headless e su macchine lente.

### Decisione
- Nel loop di `Engine` il delta del `Timer` è limitato a `[0, MAX_DELTA]` con `MAX_DELTA = 0.1` (10 FPS). Sotto i 10 FPS il gioco rallenta invece di fare salti che attraversano i collider.
- `elapsed`, passato a entità e particelle, non viene più dal `Timer`: è la somma dei delta già limitati e si azzera in `start()`. Così resta coerente con il tempo davvero simulato e non va mai all'indietro.
- `PhysicsManager.step()` mantiene il suo limite a 1/30 s, e `InstancedParticles` il suo a 0,1 s, ora ridondante ma innocuo.

### Alternative scartate
- **Limite solo in `Player.#move()`:** risolve il sintomo, ma ogni altra entità, effetto o componente della UI riceverebbe comunque delta negativi o enormi. Un solo punto nell'`Engine` protegge tutto.
- **`Timer.update()` senza timestamp (cioè `performance.now()`):** elimina il delta negativo ma non i frame da più di 1 s durante la compilazione degli shader.
- **Forzare un `world.step()` prima del primo frame:** il terreno entrerebbe subito nelle query, ma un delta enorme farebbe comunque saltare il player di metri in un passo. Con il limite non serve.

### Conseguenze
- Il codice delle entità può contare su `0 ≤ delta ≤ 0.1`. Un limite più stretto, specifico per una simulazione, va comunque messo in quella simulazione (come fa la fisica).
- `elapsed` non corrisponde più al tempo reale trascorso quando ci sono frame più lunghi di 0,1 s: è "tempo di gioco".
