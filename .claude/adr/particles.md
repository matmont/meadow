# Particles

## 001 — Sistema di particelle: `ParticleEffect`, `ParticleSystem` nell'Engine, backend `InstancedParticles`

- **Data:** 2026-10-24
- **Stato:** accettata

### Contesto
Il primo effetto (`FootDust`) era un'entità che conteneva tutto: pool, fisica, compattazione delle istanze, emissione e pulizia. Si prevedono altri effetti (scintille del piccone, schegge dell'ascia, fumo della torcia), e in futuro anche effetti animati da shader. Senza una base comune ognuno ricopierebbe la stessa infrastruttura, con il rischio di gestire male la pulizia.

### Decisione
- Una cartella `src/particles/`, accanto a `src/ui/`, con ogni effetto nella sua sottocartella (per esempio `src/particles/FootDust/`).
- **`ParticleEffect`** è la base astratta di ogni effetto, indipendente da come viene simulato e disegnato. Espone `object`, `update(delta, elapsed)`, `isIdle` (nessuna particella viva), `stop()`, `dispose()` e una cartella di debug opzionale.
- **`ParticleSystem`** è posseduto dall'`Engine` (`engine.particles`), come `EntityManager`. Viene aggiornato nel loop subito dopo le entità, così gli effetti leggono le posizioni già aggiornate, e viene svuotato in `Engine.dispose()` (quindi anche nell'HMR).
- **Fine di un effetto:** `stop()` interrompe l'emissione e le particelle ancora vive finiscono la loro vita. Quando l'effetto è fermo e vuoto, il sistema lo rimuove e chiama `dispose()`. `remove()` invece toglie l'effetto subito.
- **`InstancedParticles`** è il backend su CPU: pool preallocato usato ad anello, gravità, attrito dell'aria, collisione opzionale con il terreno, rotazione, rimpicciolimento finale. Ogni frame compatta le particelle vive nelle prime `count` istanze di un `InstancedMesh`. Le sottoclassi implementano solo `emit()` e riempiono le particelle ottenute da `spawn()`.
- Un effetto riceve la sua sorgente nel constructor tipizzata come interfaccia minima (per esempio `FootDustSource`), come i componenti della HUD.
- La creazione della cartella di debug è stata spostata in `DebugManager.createFolder()`, usata sia da `Entity` sia da `ParticleEffect`.

### Alternative scartate
- **Effetti come `Entity`:** funziona, ma un effetto ha un ciclo di vita diverso (deve poter finire da solo quando le particelle muoiono) e non ha bisogno di `onAdded`/`onRemoved`. Mescolarli renderebbe meno chiaro chi possiede cosa.
- **Manager statico come `UIManager`:** servirebbe passargli la scena dopo aver creato l'`Engine` e chiamarlo a parte nell'HMR. Come campo dell'`Engine` segue scena, loop e `dispose()` senza passaggi in più.
- **Un unico `InstancedMesh` condiviso da tutti gli effetti:** meno draw call, ma geometrie e materiali dovrebbero essere uguali per tutti. Ogni effetto ha i suoi, e la draw call in più per effetto è trascurabile.
- **Backend shader subito:** non serve ancora. Quando servirà sarà un'altra sottoclasse di `ParticleEffect` (per esempio `PointsParticles`) con la stessa interfaccia, senza toccare `ParticleSystem`.

### Conseguenze
- Un nuovo effetto su CPU si scrive estendendo `InstancedParticles`: geometria, materiale, opzioni fisiche, `emit()`. Si aggiunge con `engine.particles.add()`.
- Chi aggiunge un effetto legato a un'entità lo ferma con `stop()` quando l'entità viene distrutta.
- **Memoria:** nessuna allocazione per frame. Un effetto possiede geometria, materiale e buffer delle istanze e li libera in `dispose()`. Verificato nel browser: 50 effetti aggiunti e fermati vengono rimossi automaticamente e il numero di geometrie della GPU torna al valore iniziale; l'heap JS dopo il garbage collector ha lo stesso andamento con e senza particelle.
- `InstancedParticles` ha un tetto di particelle vive (`capacity`): se viene superato, lo slot più vecchio viene riutilizzato anche se è ancora vivo.

## Guida — Aggiungere un effetto su CPU (`InstancedParticles`)

Questa sezione non è una decisione: è un tutorial da aggiornare se cambia l'API. L'esempio aggiunge delle scintille quando il player colpisce con un tool (evento `toolHit`). `FootDust` è un esempio completo già funzionante.

### 1. Cartella e file
Ogni effetto ha la sua cartella: `src/particles/ToolSparks/ToolSparks.ts`. I colori nuovi vanno in `src/colors.ts`: per l'esempio si aggiunge `spark: 0xffc04d` a `COLORS`.

### 2. La sorgente
L'effetto non riceve la classe concreta (`Player`), ma un'interfaccia minima dichiarata nel suo file, con solo quello che legge:

```ts
export interface ToolSparksSource {
  readonly object: Object3D;
}
```

### 3. La classe
Si estende `InstancedParticles` passando al costruttore della base:
- **geometria e materiale**, creati apposta per questo effetto: li libera la base in `dispose()`, quindi non vanno condivisi con altri oggetti (niente modelli della cache di `LoaderManager`);
- **le opzioni**: `capacity` (il massimo di particelle vive, cioè rate × vita massima più eventuali raffiche), `gravity`, `drag`, `ground`, `shrinkStart`, `castShadow`.

```ts
import { BoxGeometry, Color, MeshBasicMaterial, Vector3 } from "three";
import type { Object3D } from "three";
import { COLORS } from "../../colors";
import { InstancedParticles } from "../InstancedParticles";

export interface ToolSparksSource {
  readonly object: Object3D;
}

const SPARKS_PER_HIT = 12;
const sparkColor = new Color(COLORS.spark);

export default class ToolSparks extends InstancedParticles {
  readonly #source: ToolSparksSource;
  readonly #origin = new Vector3();
  #requested = 0;

  constructor(source: ToolSparksSource) {
    super(
      new BoxGeometry(1, 1, 1),
      // Unlit: sparks glow and should not depend on the sun
      new MeshBasicMaterial(),
      { capacity: 64, gravity: 6, drag: 2, shrinkStart: 0.3 },
    );
    this.#source = source;
  }

  // Called from outside: only records the request, particles are born in emit()
  hit(): void {
    this.#requested += SPARKS_PER_HIT;
  }

  protected override emit(): void {
    if (this.#requested === 0) return;
    this.#source.object.getWorldPosition(this.#origin);
    this.#origin.y += 1;

    for (let i = 0; i < this.#requested; i++) {
      const particle = this.spawn();
      particle.position.copy(this.#origin);
      particle.velocity.set(
        Math.random() * 4 - 2,
        Math.random() * 3 + 1,
        Math.random() * 4 - 2,
      );
      particle.color.copy(sparkColor);
      particle.size = 0.04;
      particle.life = 0.3 + Math.random() * 0.3;
    }
    this.#requested = 0;
  }
}
```

### 4. Regole di `emit()` e `spawn()`
- `emit(delta, elapsed)` viene chiamato a ogni frame, prima della simulazione, e **non** viene chiamato dopo `stop()`. Per questo le richieste esterne (come `hit()`) vanno solo registrate, e le particelle nascono in `emit()`: un effetto fermato non ne crea di nuove.
- `delta` è già limitato dalla base: per un'emissione continua si accumula `rate * delta` e si emette la parte intera, come fa `FootDust`.
- `spawn()` restituisce lo slot più vecchio già azzerato: posizione, velocità, rotazione e `spin` a zero, colore bianco, `size` 1, `life` 1. Si impostano solo i campi che servono.
- `size` è la scala uniforme della geometria. Con una geometria di lato 1 centrata nell'origine è anche l'altezza della particella, ed è quello che usa la collisione con il terreno (`ground`).
- Non allocare nulla per particella o per frame: niente `new Vector3()` dentro `emit()`, si riusano campi privati come `#origin`.

### 5. Aggiungerlo al gioco
In `main.ts`, dopo aver creato l'entità sorgente:

```ts
const sparks = engine.particles.add(new ToolSparks(player));
player.events.addEventListener("toolHit", () => sparks.hit());
```

Se l'entità sorgente può essere distrutta, chi ha aggiunto l'effetto chiama `sparks.stop()` in quel momento (e rimuove i listener che ha registrato). Le scintille ancora in aria finiscono la loro traiettoria, poi il sistema rimuove l'effetto e ne libera le risorse.

### 6. Debug e verifica
- Per regolare i valori dal vivo con `?debug`, si fa l'override di `onDebugGuiCreate(folder)` e si aggiungono i controlli (vedi `FootDust`). La cartella viene creata e distrutta dal sistema.
- Prima di considerare finito l'effetto: `yarn build`, prova nel browser con e senza `?debug`, e nessun errore in console.
