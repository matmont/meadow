# Interaction

## 001 — `Interactable` posseduto dall'entità, `InteractionManager` che sceglie il focus, outline a inverted hull, prompt nella HUD

- **Data:** 2026-10-25
- **Stato:** accettata

### Contesto
Nel mondo ci sono entità su cui il player può agire, spesso con un tool preciso: l'albero si colpisce con l'ascia per raccogliere legna, una roccia col piccone, e così via. Il primo passo è rendere visibile questa possibilità. Quando il player è abbastanza vicino, è rivolto più o meno verso l'oggetto e ha in mano il tool giusto, l'oggetto si evidenzia con un contorno bianco e sopra compare un prompt con il tasto e il nome dell'azione (per esempio `[J] Harvest`). Il sistema deve rendere facile aggiungere nuovi oggetti interagibili e nuove azioni, anche senza tool.

### Decisione

**Le entità dichiarano, un sistema decide.** Scegliere quale oggetto è "a fuoco" è un problema globale, perché bisogna confrontare tutti i candidati. Per questo non lo risolve la singola entità.

- **`Interactable`** (`src/interaction/Interactable.ts`) è un oggetto posseduto dall'entità per composizione. Contiene:
  - le azioni offerte (`InteractionAction`: `id`, `label`, `tool` opzionale);
  - il raggio d'azione sul piano XZ;
  - l'altezza del prompt;
  - la callback `onAction`;
  - un `isEnabled` opzionale (per esempio un albero già abbattuto).
  
  L'entità lo registra con `InteractionManager.register()` in `onAdded()` e lo toglie con `unregister()` in `onRemoved()`. `Tree` è il primo esempio.
- **`InteractionManager`** (`src/interaction/InteractionManager.ts`) è statico, come `UIManager` e `AudioManager`. `main.ts` lo inizializza con il player (`InteractorSource`, interfaccia minima) e lo distrugge nell'HMR. L'`Engine` chiama `update()` subito dopo le entità, così la scelta si basa sulla posizione del player già aggiornata per questo frame.
  - **Candidati:** gli interactable abilitati che hanno un'azione per il tool selezionato, o un'azione senza tool. Se ci sono entrambe, vince quella col tool.
  - **Condizioni:** distanza orizzontale entro `radius` e angolo rispetto alla direzione del player entro 50°. Il punteggio è `distanza / raggio + (1 − dot)`: vince il più basso.
  - **Isteresi:** l'oggetto già a fuoco resta tale entro limiti più larghi (raggio ×1,15, angolo 70°), così il contorno non salta fra due alberi vicini. Mentre il tool è in uso l'angolo non conta, perché il player si sta girando verso il bersaglio.
  - Nessuna allocazione per frame: vettori riusati come campi statici.
- **Esecuzione:**
  - Le azioni con tool partono dall'evento `toolHit` del player, quindi una volta per colpo dell'animazione `ToolUse` (vedi [player-tools 002](player-tools.md#002--tool-in-mano-tooluse-a-figura-intera-evento-toolhit-luce-della-torcia-sempre-presente)). Il tasto mostrato nel prompt è `TOOL_USE_KEY` (`J`), definito in `tools.ts` e usato anche dal `Player`.
  - Le azioni senza tool partono sul fronte di pressione di `INTERACT_KEY` (`E`).
  - Il `Player` non conosce alberi, rocce o interactable.
- **Rotazione verso il bersaglio:** mentre il tool è in uso e l'oggetto a fuoco ha un'azione con tool, il manager chiama `player.faceTowards(punto)`. In tutti gli altri casi chiama `faceTowards(null)`. Il `Player` applica la rotazione solo quando sta usando il tool e non si muove, con lo stesso smoothing esponenziale della camminata. Così il player decide come girarsi e il manager decide soltanto verso cosa.
- **Contorno bianco a inverted hull** (`src/interaction/Outline.ts`):
  - Per ogni mesh si crea una mesh figlia con la stessa geometria e un unico `ShaderMaterial` condiviso (`OUTLINE_MATERIAL`, `BackSide`). Il vertex shader sposta i vertici lungo la normale in view space, scalando per la profondità, così il contorno ha più o meno la stessa larghezza a schermo a qualunque distanza.
  - I modelli low-poly hanno normali spezzate sugli spigoli e il guscio si aprirebbe. Per evitarlo si usa un attributo `outlineNormal` con le normali dei vertici che condividono la stessa posizione mediate fra loro.
  - La geometria del guscio si costruisce **una volta per geometria sorgente** (cache `WeakMap`), perché i modelli clonati condividono le geometrie. Condivide i buffer di posizione e indice della sorgente, quindi non va mai distrutta: vive quanto il modello in cache.
  - Le mesh del guscio si creano solo al primo focus e restano agganciate **solo mentre l'oggetto è evidenziato**. Il `dispose()` dell'entità quindi non le vede mai: l'oggetto a fuoco perde il focus in `unregister()`, che avviene in `onRemoved()`, prima di `dispose()`.
  - `SkinnedMesh` e `InstancedMesh` per ora vengono saltate.
- **Prompt nella HUD esistente:** `InteractionPrompt` (`src/ui/InteractionPrompt/`) è un normale `UIComponent`.
  - Riceve `InteractionPromptSource` (in pratica la classe `InteractionManager`, che espone getter statici) e la camera.
  - In `update()` proietta il punto di ancoraggio in pixel interi. I binding scrivono `--x`/`--y` come variabili CSS, insieme a label, tasto e visibilità. Tutti i valori sono primitivi.
  - Si monta nel nuovo slot `world` di `UIManager` (vedi [hud-ui 002](hud-ui.md#002--slot-world-per-elementi-ancorati-al-mondo-3d)).
  - C'è un solo prompt per tutto il gioco, quello dell'oggetto a fuoco.
- **`Tree`:** azione `harvest` con l'ascia, raggio uguale al raggio del collider più 1,2 m, prompt 0,2 m sopra la cima. Per ora `#harvest()` non fa nulla: legna, scossa e abbattimento sono ancora da decidere.

### Alternative scartate
- **Interazione nella classe base `Entity`:** la maggior parte delle entità (camera, sole, vento, terreno, debug) non è interagibile, e ogni capacità aggiunta alla base la pagano tutte. La composizione con `Interactable` lascia `Entity` com'è.
- **Ogni entità disegna la propria UI:** con più oggetti vicini comparirebbero più prompt, e per scegliere quale mostrare servirebbe comunque qualcuno che li veda tutti. Se un giorno un oggetto avrà bisogno di una UI tutta sua (per esempio la vita dell'albero), `Interactable` potrà esporre un `createPrompt?()` opzionale con un nuovo ADR.
- **Registrazione automatica in `EntityManager`** (se l'entità ha un campo `interactable`): un legame implicito e difficile da vedere leggendo l'entità. `register` e `unregister` espliciti seguono lo schema "chi aggiunge, rimuove" usato per particelle e HUD.
- **`OutlinePass` / `EffectComposer`:** costringerebbe a portare tutto il rendering su una pipeline di post-processing (MSAA su render target, output pass, color space) e aggiungerebbe vari pass a ogni frame anche quando nulla è evidenziato. L'inverted hull costa una draw call per mesh solo mentre l'oggetto è a fuoco.
- **Outline con `geometry.clone()`:** duplicherebbe in memoria i buffer di posizione per ogni istanza. Condividere gli attributi della sorgente costa soltanto il nuovo attributo delle normali.
- **Prompt come sprite o testo in WebGL:** font, layout e stile andrebbero rifatti a mano, mentre la HUD in DOM ha già tutto (vedi [hud-ui 001](hud-ui.md)).
- **`Player` che interroga direttamente l'`InteractionManager`:** il player dipenderebbe dal sistema di interazione. Con `toolHit` e `faceTowards()` la dipendenza va in un solo verso.
- **Raycast dalla camera o dal player per scegliere il bersaglio:** su una camera dall'alto distanza e angolo bastano e costano meno. Si potrà aggiungere un controllo di occlusione se oggetti dietro a un muro diventeranno un problema.

### Conseguenze
- Un nuovo oggetto interagibile richiede un `Interactable` nel constructor, `register`/`unregister` in `onAdded`/`onRemoved` e la sua `onAction`.
- Un'entità interagibile che crea geometrie e materiali propri può continuare a usare il `dispose()` base, perché i gusci del contorno non sono agganciati al momento del dispose.
- Il primo focus su un modello calcola le normali smussate di ogni sua geometria. Per i modelli attuali è trascurabile; per modelli molto densi si potrà precalcolare al caricamento.
- Il colpo che parte da `toolHit` usa l'oggetto a fuoco del frame precedente, perché il player si aggiorna prima del manager. Una differenza di un frame è irrilevante.
- Il contorno è bianco semitrasparente (`opacity` 0,5, materiale `transparent` che scrive comunque la profondità). `outline thickness`, `outline opacity` e l'oggetto a fuoco sono nella cartella di debug "Interaction".
