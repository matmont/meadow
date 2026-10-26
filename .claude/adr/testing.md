# Testing

## 001 — Vitest per test unitari e di integrazione

- **Data:** 2026-10-26
- **Stato:** accettata. La posizione dei test unitari (accanto al modulo come `*.test.ts`) è sostituita il 2026-10-26 dalla [002](#002--test-unitari-in-cartelle-__tests__-accanto-al-modulo).

### Contesto
Finora l'unico controllo automatico era `yarn build` (`tsc` più il bundle di Vite), seguito da uno smoke test manuale nel browser. Le prossime funzionalità (inventario, contatore delle risorse nell'HUD, modifiche persistenti al mondo, abbattimento e ricrescita degli alberi) contengono logica pura e interazioni con Rapier che conviene verificare senza aprire il gioco. Serve un test runner che:
- capisca TypeScript ed ESM senza una seconda pipeline di compilazione;
- risolva i moduli come fa Vite (base path, `import.meta.env`, import di asset);
- giri in Node, senza browser, e carichi Rapier (`@dimforge/rapier3d-compat` ha il WebAssembly inline in base64, quindi non richiede `fetch`).

### Decisione
- **Vitest** (`^5.0.5`, compatibile con Vite 8) come devDependency, con `vitest.config.ts` che estende `vite.config.ts` tramite `mergeConfig`, così il base path resta configurato in un solo posto.
- Due progetti Vitest (`projects`): `unit` per `src/**/*.test.ts`, test co-locati accanto al modulo, **(sostituito il 2026-10-26 da [002](#002--test-unitari-in-cartelle-__tests__-accanto-al-modulo))** e `integration` per `tests/integration/**/*.test.ts`, test che mettono insieme più moduli (per esempio entità e mondo Rapier).
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

## 002 — Test unitari in cartelle `__tests__` accanto al modulo

- **Data:** 2026-10-26
- **Stato:** accettata. Sostituisce il punto della [001](#001--vitest-per-test-unitari-e-di-integrazione) sulla posizione dei test unitari.

### Contesto
La 001 metteva i test unitari accanto al modulo come `foo.test.ts`. Con la crescita dei test (mondo a chunk, inventario, HUD, registro delle modifiche al mondo, alberi) le cartelle sorgente mescolano moduli e test, e l'elenco dei file di una cartella diventa più difficile da leggere. Si vuole tenere i test vicini al codice, ma fuori dall'elenco dei sorgenti.

### Decisione
- Un test unitario sta in una cartella `__tests__/` accanto al file sorgente che testa, con lo stesso nome di base: `src/entities/World/chunks.ts` → `src/entities/World/__tests__/chunks.test.ts`, `src/Inventory.ts` → `src/__tests__/Inventory.test.ts`.
- Un file di test per ogni file sorgente. Le fixture usate solo dai test unitari vanno in `__tests__/fixtures/`.
- Il progetto `unit` di `vitest.config.ts` raccoglie solo `src/**/__tests__/**/*.test.ts`: un `*.test.ts` in `src/` fuori da `__tests__/` non viene eseguito.
- I test di integrazione restano in `tests/integration/` (fixture in `tests/integration/fixtures/`); i futuri test end-to-end andranno in `tests/e2e/`.
- `tsconfig.json` include già tutto `src`, quindi `tsc` controlla anche i test spostati; nessun test è importato da `main.ts`, quindi non finiscono nel bundle.

### Alternative scartate
- **`foo.test.ts` accanto al modulo (la scelta della 001):** è la convenzione più diffusa, ma l'utente preferisce tenere i test fuori dall'elenco dei file sorgenti.
- **Albero speculare in `tests/unit/`:** i percorsi divergono quando i file sorgente vengono spostati o rinominati, e i test finiscono lontani dal codice che verificano.

### Conseguenze
- Gli import relativi nei test unitari partono da `../` (per esempio `import { chunkSeed } from "../chunks";`), e lo stesso vale per i percorsi in `vi.mock`.
- Spostare un modulo richiede di spostare anche la sua cartella `__tests__/` (o il file di test al suo interno).
- Il conteggio dei test va controllato dopo ogni spostamento: un file fuori da `__tests__/` smette di essere raccolto senza errori.
