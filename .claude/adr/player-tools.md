# Player tools

## 001 — Tool di base definiti come costanti, selezione nel Player, ToolBar in sola lettura

- **Data:** 2026-10-19
- **Stato:** accettata

### Contesto
Il player deve poter scegliere fra tre tool di base (piccone, ascia, torcia), e la HUD deve mostrare quale è selezionato e quale tasto premere per selezionarlo.

### Decisione
- I tool sono una lista `as const` in `src/entities/Player/tools.ts` (`TOOLS`), ognuno con `id`, `name` e `key`. I tipi `Tool` e `ToolId` sono derivati dalla lista, così aggiungere un tool è un'unica modifica controllata dal compilatore.
- Lo stato (`selectedTool`) vive solo in `Player`, che espone `tools` e `selectedTool` come getter. La selezione avviene in `#readInput()` con i tasti numerici (`Digit1`, `Digit2`, `Digit3`).
- `ToolBar` (`src/ui/ToolBar/`, slot `bottomLeft`) riceve il player come `ToolBarSource` e ha un binding booleano per ogni slot (`selectedTool === tool.id`), come stabilito in [hud-ui.md](hud-ui.md).
- Le icone sono SVG inline in `src/ui/ToolBar/icons.ts`, indicizzate per `ToolId` (`Record<ToolId, string>`). Se si aggiunge un tool senza icona, il build fallisce. **Sostituita il 2026-10-24 da [003](#003--icone-renderizzate-dai-modelli-3d-tasto-j-per-usare-il-tool).**

### Alternative scartate
- **Selezione con il click sugli slot:** la UI dovrebbe scrivere nello stato del player, mentre la regola della HUD è che la UI legge soltanto. Se servirà, andrà introdotto un canale esplicito di comandi dalla UI al gioco, con un nuovo ADR.
- **Icone come emoji:** il rendering cambia da sistema a sistema e non si possono colorare in modo coerente con lo stato selezionato.
- **Libreria di icone (es. Lucide):** una dipendenza in più per tre icone. Da rivalutare se le icone aumentano.
- **Icone o etichette dentro `tools.ts`:** mescolerebbe dati di gioco e presentazione. La definizione di gioco resta indipendente dalla UI.

### Conseguenze
- Per aggiungere un tool: una voce in `TOOLS` e un'icona in `TOOL_ICONS`. (Dalla [003](#003--icone-renderizzate-dai-modelli-3d-tasto-j-per-usare-il-tool) l'icona non serve più.)
- Il tool selezionato non ha ancora effetti di gioco (animazione `ToolUse`, interazioni): arriveranno in un passaggio successivo, leggendo `selectedTool` dal player.

## 002 — Tool in mano, ToolUse a figura intera, evento `toolHit`, luce della torcia sempre presente

- **Data:** 2026-10-19
- **Stato:** accettata

### Contesto
Gli attrezzi sono in `public/models/tools/tools.glb` (nodi `Pickaxe`, `Axe`, `Torch`) e sono modellati nello spazio locale dell'osso `hand.R` dell'explorer. (Dalla [004](#004--nuovo-personaggio-characterglb-e-tool-characterstoolsglb) i modelli sono `character.glb` e `character_tools.glb`.) Il personaggio ha la clip `ToolUse`, con l'impatto intorno a 0,5 s.

### Decisione
- `LoaderManager.instantiate(id, node?)` può clonare un singolo nodo con nome. Ogni tool in `TOOLS` dichiara il suo `node` e, per la torcia, una `light` (colore, intensità, distanza).
- `ToolHolder` (`src/entities/Player/ToolHolder.ts`) aggancia il tool all'osso della mano, cercato come `handR` (nome sanificato da `GLTFLoader`) con fallback a `hand.R`, senza offset. **Il fallback è stato rimosso il 2026-10-25 con la [004](#004--nuovo-personaggio-characterglb-e-tool-characterstoolsglb): non scattava mai.** Non distrugge geometrie e materiali, che sono condivisi con il modello in cache.
- La `PointLight` della torcia esiste per tutta la vita del player: quando la torcia non è in mano resta con intensità 0. Aggiungere o togliere una luce cambia il numero di luci della scena e fa ricompilare gli shader di tutti i materiali, con un piccolo scatto a ogni cambio di tool. Il tremolio è uno smoothing esponenziale verso un'intensità casuale (±10%).
- Con il tasto sinistro del mouse tenuto premuto il player entra nello stato `toolUse` (clip `ToolUse` in loop) e resta fermo. Il salto ha la precedenza.
- `Player.events` (`EventDispatcher<PlayerEventMap>`) emette `toolHit` una volta per ciclo, quando il tempo della clip supera 0,5 s. È lì che si agganceranno abbattimento alberi, estrazione rocce, ecc.
- Il mouse passa da `InputManager` con codici `MouseLeft`/`MouseMiddle`/`MouseRight`. La pressione conta solo se parte sul canvas, così i click su lil-gui o sulla HUD non usano il tool.

### Alternative scartate
- **ToolUse solo sulla parte superiore mentre si cammina:** il mixer di three.js normalizza i pesi per proprietà, quindi `Walk` a peso 1 più `ToolUse` (solo braccia) a peso 1 darebbero braccia a metà fra le due clip. Per farlo bene bisognerebbe dividere anche le clip di locomozione in parte alta e bassa. Rimandato, eventualmente con un nuovo ADR.
- **Creare e distruggere la luce della torcia a ogni equip:** ricompilazione degli shader a ogni cambio di tool.
- **Callback singola `onToolHit` sul player:** un `EventDispatcher` permette più ascoltatori indipendenti (alberi, rocce, suoni) senza toccare il player.
- **Tasto 0 per "nessun tool":** non serve finché la ToolBar ha sempre una selezione; da aggiungere se arriva un caso d'uso.

### Conseguenze
- Chi ascolta `toolHit` deve rimuovere il listener quando viene distrutto.
- `toolHits` nel pannello debug del player permette di verificare che l'evento scatti una volta per colpo.
- Velocità di camminata e corsa e tempi del salto non sono ancora allineati alle nuove clip (lo stacco del salto è a ~0,375 s): da tarare a parte.

## 003 — Icone renderizzate dai modelli 3D, tasto J per usare il tool

- **Data:** 2026-10-24
- **Stato:** accettata. Sostituisce la parte sulle icone SVG della [001](#001--tool-di-base-definiti-come-costanti-selezione-nel-player-toolbar-in-sola-lettura).

### Contesto
Le icone SVG disegnate a mano non somigliavano agli attrezzi veri del gioco. Inoltre si vuole poter usare il tool anche da tastiera.

### Decisione
- `renderToolIcons()` (`src/ui/ToolBar/icons.ts`) all'avvio istanzia ogni tool da `tools.glb`, lo inquadra di profilo con una camera ortografica (i manici sono lungo `-Z`, quindi la camera sta su `+X`) e lo inclina in diagonale secondo `ICON_ROTATION`. Ogni icona diventa un PNG trasparente (`toDataURL()`), mostrato con un `<img>`.
- Il `WebGLRenderer` usato per le icone esiste solo durante quella chiamata: alla fine viene distrutto con `forceContextLoss()`, così non resta un secondo contesto WebGL accanto a quello del gioco. Geometrie e materiali sono condivisi con il modello in cache e non vengono distrutti.
- Il tool si usa tenendo premuto il tasto sinistro del mouse **oppure** `KeyJ` (`InputManager.isAnyPressed`).

### Alternative scartate
- **PNG pre-renderizzati in `public/`:** andrebbero rigenerati a mano a ogni modifica dei modelli in Blender. Il rendering all'avvio costa pochi millisecondi e resta sempre allineato.
- **Rendering con il renderer del gioco:** costringerebbe a passare l'`Engine` alla UI e a cambiare temporaneamente dimensione e render target del canvas principale.

### Conseguenze
- Per aggiungere un tool basta la voce in `TOOLS` e una rotazione in `ICON_ROTATION`, controllata dal compilatore tramite `Record<ToolId, …>`.
- Le icone sono illuminate da luci fisse proprie: la fiamma della torcia non ha l'aspetto acceso che ha in gioco.

## 004 — Nuovo personaggio `character.glb` e tool `character_tools.glb`

- **Data:** 2026-10-25
- **Stato:** accettata. Aggiorna i file dei modelli citati nella [002](#002--tool-in-mano-tooluse-a-figura-intera-evento-toolhit-luce-della-torcia-sempre-presente) e nella [003](#003--icone-renderizzate-dai-modelli-3d-tasto-j-per-usare-il-tool).

### Contesto
Il personaggio e gli attrezzi sono stati rifatti in Blender. Il nuovo `public/models/characters/character.glb` è già a misura reale (1,685 m, 1,85 m con i capelli) e ha l'origine ai piedi, centrata sotto il corpo. Mantiene i nomi delle clip (`Idle`, `Walk`, `Run`, `Jump`, `ToolUse`, con le stesse durate) e l'osso `hand.R`; aggiunge `chest`, `neck` e i piedi. In `public/models/tools/character_tools.glb` i nodi `Pickaxe`, `Axe`, `Torch` e il materiale `TL_Flame` restano gli stessi, ma con la scala 1,3 già applicata nel file e un offset nuovo rispetto alla mano.

### Decisione
- In `LoaderManager` la voce `explorer` punta a `character.glb` senza `scale` (vale 1 di default), la voce `tools` a `character_tools.glb`. Gli id restano invariati, così `Player`, `ToolHolder` e le icone della ToolBar non cambiano.
- `Player` non ricentra più il modello con il bounding box: l'origine è già ai piedi, e con i capelli asimmetrici il ricentro spostava il modello di circa 2 cm.
- L'osso della mano si cerca solo come `handR`: `GLTFLoader` toglie sempre il punto dai nomi, quindi il fallback `hand.R` non trovava mai nulla.

### Alternative scartate
- **Rinominare gli id (`explorer` → `character`):** cambio puramente estetico che tocca più file; da fare eventualmente insieme ad altri ritocchi del player.
- **Tenere la scala 1,3 nel `LoaderManager`:** le misure reali nel file evitano che la scala del personaggio e quella dei tool vadano tenute allineate a mano nel codice.

### Conseguenze
- I nuovi modelli devono restare con l'origine ai piedi: il codice non la corregge più.
- I vecchi `explorer.glb`, `explorer.blend` e `tools.glb` restano in `public/` ma non sono più registrati.
- I file `.blend` in `public/` vengono copiati in `dist/` dal build di Vite.
