# HUD / 2D UI

## 001 — DOM overlay, vanilla TS components, state read directly from its owner

- **Data:** 2026-10-19
- **Stato:** accettata

### Contesto
Serve una HUD 2D (indicatori, pannelli, prompt) che sia modulare, con un file per ogni pezzo di UI, e che resti sempre allineata allo stato del gioco. Il progetto non usa framework e ha già un pattern di manager statici e di entità con un ciclo di vita esplicito.

### Decisione
- La HUD è un overlay HTML/CSS (`<div id="ui">`) sopra il canvas, con slot di layout (`topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `center`) e `pointer-events: none` sul root.
- `UIManager` (statico, accanto agli altri manager) monta e smonta i componenti, li aggiorna a ogni frame dal loop di `Engine` dopo lo step fisico e li ripulisce nell'HMR.
- I componenti stanno in `src/ui/`, estendono `UIComponent` (ciclo di vita simile a `Entity`) e usano un CSS module ciascuno.
- **Una sola fonte di verità:** lo stato resta nel suo proprietario (per esempio `Player`). Il componente riceve la sorgente nel constructor, tipizzata come interfaccia minima, e la legge senza copiarla.
- **Sincronizzazione a polling:** `bind(read, write)`. Ogni frame si rilegge il valore e si aggiorna il DOM solo se è cambiato (`Object.is`). Si legano solo valori primitivi.

### Alternative scartate
- **Sprite o testo dentro WebGL:** layout, testo, font e accessibilità andrebbero rifatti a mano, e la UI peserebbe sul render. Utile solo per elementi legati a punti nel mondo 3D, da valutare a parte.
- **Preact + signals:** comodo per menu e liste complesse, ma aggiunge una dipendenza e la configurazione JSX. Per una HUD fatta di indicatori e pannelli il vanilla basta ed è coerente con il resto del codice. Da rivalutare se arrivano UI molto dinamiche (inventari, menu annidati).
- **Store globale `GameState` scritto dalle entità:** duplicherebbe lo stato (`Player.state` e `GameState.player.state`) con il rischio che vadano fuori sincrono, e ogni entità dovrebbe ricordarsi di scriverci.
- **Eventi o subscribe:** ogni cambio di stato richiederebbe un `emit`, facile da dimenticare, e le subscription andrebbero rimosse a mano. Il polling costa pochissimo con valori primitivi e non può restare indietro, come `.listen()` di lil-gui.

### Conseguenze
- Aggiungere un pezzo di UI significa creare un file in `src/ui/`, dichiarare un'interfaccia sorgente e dei binding, e aggiungerlo con `UIManager.add()`.
- Chi aggiunge un componente legato a un'entità deve rimuoverlo quando l'entità viene distrutta.
- Ogni binding costa una lettura per frame: va bene per decine di binding, non per migliaia di elementi (per liste lunghe servirà un approccio diverso, con un nuovo ADR).
- Uno stato davvero globale, che non appartiene a nessuna entità, va messo in un manager proprietario e letto nello stesso modo. Un eventuale store dedicato richiede un nuovo ADR.

## 002 — Slot `world` per elementi ancorati al mondo 3D

- **Data:** 2026-10-25
- **Stato:** accettata. Risolve il caso degli elementi legati a punti del mondo 3D, lasciato aperto nella [001](#001--dom-overlay-vanilla-ts-components-state-read-directly-from-its-owner).

### Contesto
Il prompt di interazione (vedi [interaction.md](interaction.md)) deve comparire sopra un oggetto della scena e seguirlo sullo schermo. Gli slot esistenti sono fissi negli angoli e al centro.

### Decisione
- `UIManager` ha un nuovo slot `world`: un layer a tutto schermo senza layout, creato per primo, così resta sotto il resto della HUD. I figli si posizionano da soli in pixel rispetto all'angolo in alto a sinistra.
- Un componente ancorato al mondo riceve la camera nel constructor e in `update()` proietta il suo punto di ancoraggio. Arrotonda la posizione ai pixel interi, così i binding scrivono solo quando l'elemento si sposta davvero sullo schermo. La posizione si applica come variabili CSS `--x`/`--y`, usate dal `transform` nel CSS module, con un binding numerico ciascuna.

### Alternative scartate
- **Sprite o `CSS2DRenderer` di three.js:** il primo richiederebbe di ridisegnare testo e stile in WebGL. Il secondo è un secondo renderer da tenere allineato a resize e camera, e porterebbe la UI fuori da `UIManager` e dal suo ciclo di vita.
- **Scrivere `transform` come stringa in un solo binding:** creerebbe una stringa a ogni frame solo per confrontarla. Due numeri non allocano.

### Conseguenze
- Con molti elementi ancorati (per esempio etichette su decine di oggetti) la proiezione per componente e i binding per frame andranno rivalutati.
