# Testing

## 001 — Vitest per test unitari e di integrazione

- **Data:** 2026-10-26
- **Stato:** accettata

### Contesto
Finora l'unico controllo automatico era `yarn build` (`tsc` più il bundle di Vite), seguito da uno smoke test manuale nel browser. Le prossime funzionalità (inventario, contatore delle risorse nell'HUD, modifiche persistenti al mondo, abbattimento e ricrescita degli alberi) contengono logica pura e interazioni con Rapier che conviene verificare senza aprire il gioco. Serve un test runner che:
- capisca TypeScript ed ESM senza una seconda pipeline di compilazione;
- risolva i moduli come fa Vite (base path, `import.meta.env`, import di asset);
- giri in Node, senza browser, e carichi Rapier (`@dimforge/rapier3d-compat` ha il WebAssembly inline in base64, quindi non richiede `fetch`).

### Decisione
- **Vitest** (`^5.0.5`, compatibile con Vite 8) come devDependency, con `vitest.config.ts` che estende `vite.config.ts` tramite `mergeConfig`, così il base path resta configurato in un solo posto.
- Due progetti Vitest (`projects`): `unit` per `src/**/*.test.ts`, test co-locati accanto al modulo, e `integration` per `tests/integration/**/*.test.ts`, test che mettono insieme più moduli (per esempio entità e mondo Rapier).
- Script: `yarn test` (tutti, una volta sola, non in watch), `yarn test:unit` e `yarn test:integration` (`--project`).
- Ambiente `node` di default, senza DOM. Un test che ne ha davvero bisogno aggiunge `happy-dom` o `jsdom` come devDependency e lo attiva nel singolo file con il commento `// @vitest-environment happy-dom`. Oggi nessuno dei due è installato.
- Le API si importano esplicitamente da `"vitest"` (niente globals), quindi `tsconfig.json` non cambia tipi globali. `tests` è aggiunto a `include`, così `tsc` (e quindi `yarn build`) controlla anche i test con gli stessi controlli strict. I test non sono importati da `main.ts` e non finiscono nel bundle.
- Rapier: il campo `main` del pacchetto punta a un file CommonJS dentro un pacchetto `"type": "module"`, che Node non riesce a caricare; trasformarlo con Vite (`server.deps.inline`) rompe invece il suo default export congelato. Solo nella configurazione dei test un alias porta `@dimforge/rapier3d-compat` alla build ESM (`rapier.es.js`, la stessa del campo `module` usata dal bundle per il browser), che Node importa nativamente. `PhysicsManager` si usa così com'è.
- Primi test: `chunkSeed`, `ChunkGrid` e `createSeededRandom` come unitari; inizializzazione di `PhysicsManager` e caduta di un corpo su un collider fisso come integrazione.

### Alternative scartate
- **Jest:** richiede una trasformazione separata per TypeScript ed ESM (`ts-jest` o Babel) e una seconda configurazione di risoluzione dei moduli, che può divergere da quella di Vite.
- **`node:test`:** nessuna dipendenza, ma Node non esegue TypeScript con import `.ts` senza estensione né le funzionalità di Vite (`import.meta.env`, alias, asset); servirebbe comunque un loader o una compilazione a parte.
- **Playwright (o test nel browser) per la logica unitaria:** troppo pesante per funzioni pure: serve un browser, l'avvio è lento e i test sono più fragili. Resta un'opzione per futuri test end-to-end, non per questo livello.
- **Vitest con un solo progetto e filtri per cartella:** funziona, ma i progetti danno nomi espliciti nell'output e permettono in futuro impostazioni diverse (per esempio un ambiente DOM o timeout più lunghi solo per l'integrazione).

### Conseguenze
- `yarn build` e `yarn test` sono i controlli automatici; lo smoke test nel browser resta necessario per rendering, input, audio e WebGL, che i test non coprono.
- La logica testabile conviene tenerla separata dal rendering, con dipendenze ricevute come parametri (per esempio un `RandomSource` con seed invece di `Math.random`).
- I test di integrazione con Rapier devono rimuovere i propri corpi e collider e chiamare `PhysicsManager.dispose()` in `afterAll`, come nel gioco.
- Se Rapier cambia la struttura dei file nel pacchetto, l'alias in `vitest.config.ts` va aggiornato.
- Il primo giro di test ha trovato un difetto già presente: `chunkSeed(x, z)` coincide con `chunkSeed(-x, -z)` per molti chunk, che quindi hanno la stessa disposizione. Il test è marcato `it.fails` finché l'hash non viene corretto.

## 002 — `happy-dom` per i test dei componenti HUD

- **Data:** 2026-10-26
- **Stato:** accettata

### Contesto
`ResourceCounter` decide visibilità, ordine e numeri delle voci tramite i binding di `UIComponent`, che scrivono sul DOM. Senza un DOM non si può costruire il componente (`h()` usa `document.createElement`), quindi la sua logica restava scoperta.

### Decisione
- `happy-dom` diventa una devDependency (aggiunta con `yarn add -D`, solo `yarn.lock`).
- L'ambiente di default resta `node`: solo i file che ne hanno bisogno attivano il DOM con `// @vitest-environment happy-dom`.
- I moduli che usano WebGL (per esempio `src/ui/ResourceCounter/icons.ts`) si sostituiscono con `vi.mock`, perché happy-dom non fornisce un contesto WebGL.
- Primi test: `src/ui/ResourceCounter/ResourceCounter.test.ts` (unitario, con una sorgente finta) e `tests/integration/resource-counter.test.ts` (con `Inventory` e `UIManager` reali).

### Alternative scartate
- **jsdom:** più completo ma più pesante e lento ad avviarsi; ai componenti HUD bastano creazione di elementi, `classList` e `textContent`.
- **DOM come ambiente di default:** rallenterebbe tutti i test e nasconderebbe dipendenze involontarie dal DOM nella logica pura.
- **Estrarre la logica del componente in funzioni pure senza DOM:** avrebbe richiesto di modificare il codice di produzione solo per i test.

### Conseguenze
- I test HUD verificano classi e testo, non lo stile calcolato: i CSS module non vengono applicati, quindi animazioni e layout restano allo smoke test nel browser.
