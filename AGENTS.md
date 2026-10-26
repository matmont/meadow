# AGENTS.md

## Project overview

This is a small browser-based Three.js playground/game built with TypeScript and Vite. Rapier provides physics, howler.js provides audio, `lil-gui` provides opt-in debug controls, and models/textures/sounds are served as static assets from `public/`.

Vitest is the test runner (see [Tests](#tests)). There is no application framework, linter, or formatter configured. Keep changes focused and follow the style of the surrounding TypeScript.

## Repository map

- `index.html`: full-screen canvas and Vite entry point.
- `src/main.ts`: application composition and required startup/shutdown order.
- `src/Engine.ts`: render loop, timing, resizing, scene, camera, renderer, and entity manager.
- `src/Entity.ts`, `src/EntityManager.ts`: entity lifecycle and scene attachment/removal.
- `src/entities/`: scene objects and gameplay behavior.
- `src/LoaderManager.ts`: typed asset registry, loading, caching, and model instantiation.
- `src/PhysicsManager.ts`: Rapier initialization, world access, stepping, and teardown.
- `src/InputManager.ts`, `src/DebugManager.ts`: global input and debug-GUI lifecycles.
- `src/AudioManager.ts`: plays and stops sounds loaded by `LoaderManager`, mute state, and the "Audio" debug folder.
- `src/UIManager.ts`: 2D HUD overlay lifecycle: layout slots inside `#ui`, mounting, per-frame binding sync, and teardown.
- `src/particles/`: particle effects (`ParticleEffect` subclasses), each in its own folder (for example `src/particles/FootDust/`), plus the shared `ParticleSystem` and the CPU backend `InstancedParticles`.
- `src/interaction/`: `Interactable` (owned by interactable entities), `InteractionManager` (focus selection, action dispatch), and the inverted-hull `Outline`.
- `src/ui/`: HUD components (`UIComponent` subclasses), each in its own folder with its `*.module.css` (for example `src/ui/DayClock/`), plus shared helpers (`dom.ts`, `ui.css`).
- `src/**/*.test.ts`: unit tests, next to the module they test.
- `tests/integration/`: integration tests that exercise several modules together (for example Rapier with `PhysicsManager`).
- `vitest.config.ts`: test configuration; it extends `vite.config.ts` and defines the `unit` and `integration` projects.
- `.claude/adr/`: architecture decision records, one file per feature.
- `public/`: source assets. URLs registered in `LoaderManager` are relative to this directory through `import.meta.env.BASE_URL`.
- `dist/`: generated Vite output; it is ignored and must not be edited by hand.

## Setup and commands

Use Yarn Classic because the repository contains a v1 `yarn.lock`.

```sh
yarn install
yarn dev
yarn build
yarn preview
yarn test
yarn test:unit
yarn test:integration
```

- `yarn dev` starts the Vite development server.
- Add `?debug` to the page URL to enable `lil-gui` and the Rapier wireframe debug entity.
- `yarn build` runs `tsc` first (which also type-checks the test files), then creates the production bundle.
- `yarn test` runs every test once; `yarn test:unit` and `yarn test:integration` run one project. Use `yarn vitest` for watch mode.
- Tests do not cover rendering, input, or audio. For behavior changes, perform a browser smoke test as well as the build and the tests.

Do not add a second lockfile or silently switch package managers.

## Tests

Vitest reuses the Vite config and toolchain. See `.claude/adr/testing.md`.

- **Unit tests** cover pure logic and live next to the module as `src/**/*.test.ts` (for example `src/entities/World/chunks.test.ts`).
- **Integration tests** exercise several modules together and live in `tests/integration/**/*.test.ts`. Rapier works in Node: `await PhysicsManager.init()` in `beforeAll`, remove every body and collider the test creates, and call `PhysicsManager.dispose()` in `afterAll` (see `tests/integration/physics.test.ts`).
- The default environment is `node`, with no DOM. A test that really needs one adds `happy-dom` (or `jsdom`) as a devDependency and opts in per file with a `// @vitest-environment happy-dom` comment on its first line. Prefer testing logic that does not touch the DOM or WebGL.
- Import test APIs explicitly (`import { describe, expect, it } from "vitest";`); globals are not enabled.
- Test files follow the same code style and strict `tsconfig` checks as the rest of the code. They are never imported by `main.ts`, so they never reach the production bundle.
- Use seeded or injected randomness (for example `createSeededRandom`) instead of `Math.random` so results are reproducible.

## Architecture and lifecycle rules

Startup order matters. `main.ts` must load assets, initialize Rapier, input, and audio (`AudioManager.init()` reads loaded sounds to build its debug folder) before constructing entities that read `LoaderManager` or `PhysicsManager`. Preserve the matching HMR cleanup for `Engine`, input, physics, debug state, and audio (otherwise looping sounds keep playing and stack up after each reload). Dispose audio before `DebugManager`, because it destroys its own folder in the debug GUI. `UIManager.init()` runs after the other managers and before UI components are added; `UIManager.dispose()` runs in the HMR cleanup before `DebugManager.dispose()`.

Entities follow this lifecycle:

1. Construct the Three.js object and any associated physics objects.
2. `EntityManager.add()` attaches it to the scene, then calls `onAdded()` and creates its optional debug folder.
3. `update(delta, elapsed)` receives seconds, not milliseconds.
4. `destroy()` only marks an entity; removal is deferred until after the update pass.
5. Removal calls `onRemoved()`, destroys the debug folder, and calls `dispose()`.

Entities that track another object, such as `FollowCamera` and `Sun`, receive it as a constructor parameter named `followed` and store it as `#followed`. It is only a reference: read its world transform each frame and never re-parent it, since a Three.js object has a single parent. Avoid calling it `target`, which collides with Three.js names such as `DirectionalLight.target`.

Put new scene/game objects in `src/entities/` and extend `Entity` when they need this lifecycle. Add them through `engine.entities`, not directly to the scene, unless they are deliberately outside entity ownership (for example the simple hemisphere light in `main.ts`).

Resource ownership is important:

- Base `Entity.dispose()` disposes mesh geometries and materials.
- `LoaderManager.instantiate()` uses `SkeletonUtils.clone`; cloned model instances can still share geometry/material resources with the cached source. Entities such as `Tree` therefore override `dispose()` and must not call `super.dispose()` for those shared assets.
- An entity that creates unique geometry/materials should normally use the base disposal behavior.
- Explicitly dispose non-mesh resources such as cloned textures, animation mixers, light shadow resources, helpers, Rapier bodies/controllers, and event listeners.
- Remove Rapier objects before `PhysicsManager.dispose()` runs.

The frame loop currently updates entities, steps Rapier, syncs the UI, and then renders. Consider that ordering before changing physics synchronization. `Engine` already clamps `delta` to `[0, 0.1]` seconds and builds `elapsed` from the clamped deltas (see `.claude/adr/frame-timing.md`); a simulation that needs a tighter bound clamps it itself, as `PhysicsManager.step()` does. Avoid needless allocations in per-frame `update()` methods; reusable vectors/quaternions are kept as fields throughout the codebase.

## Particles

Particle effects live in `src/particles/` and extend `ParticleEffect`, not `Entity`. See `.claude/adr/particles.md`.

- Add effects with `engine.particles.add()`. `Engine` updates them right after entities and disposes them in `Engine.dispose()`.
- An effect receives its source in the constructor, typed as a minimal interface declared in the effect's file (for example `FootDustSource`).
- `stop()` ends the emission; the system removes and disposes the effect once no particle is alive. Whoever adds an effect tied to an entity stops it when that entity is destroyed.
- CPU effects extend `InstancedParticles`: they own their geometry and material, implement `emit()`, and fill the particles returned by `spawn()`. The pool is preallocated, so never allocate per particle or per frame.
- A shader-driven effect would be another `ParticleEffect` subclass with the same lifecycle.

## Interactions

Entities the player can act on (for example hitting a `Tree` with the axe) own an `Interactable` and register it with the static `InteractionManager`. See `.claude/adr/interaction.md`.

- Declare the actions (`label`, optional `tool`), the reach `radius`, the `promptHeight`, and `onAction` in the entity's constructor. Call `InteractionManager.register()` in `onAdded()` and `unregister()` in `onRemoved()`.
- `InteractionManager` picks one focused target by distance and facing, highlights it with a white outline, and exposes the data for `InteractionPrompt`. Tool actions run on the player's `toolHit` event; tool-less actions run on `INTERACT_KEY` (`KeyE`).
- `main.ts` calls `InteractionManager.init(player)` after creating the player, and calls `InteractionManager.dispose()` in the HMR cleanup right after `engine.dispose()`.
- Outline hull geometries share the source's buffers and are cached for the app's lifetime: never dispose them. Hulls are attached only while highlighted.

## HUD / 2D UI

The HUD is an HTML/CSS overlay (`#ui`) above the canvas, written in vanilla TypeScript with no UI framework. See `.claude/adr/hud-ui.md` for the reasoning.

- Game state lives only in its owner (entity or manager). UI never copies or mirrors it and never writes to it.
- A UI component receives its source in the constructor, typed as a minimal interface declared in the component's file (for example `DayClockSource`), not as the concrete entity class.
- Keep the UI in sync with `bind(read, write)`: `UIManager` re-reads every binding each frame and calls `write` only when the value changed (`Object.is`). Bound values must be primitives, so comparisons are reliable and nothing is allocated per frame.
- Add components with `UIManager.add(component, slot)`. Elements anchored to a 3D point go in the full-screen `world` slot, project their anchor in `update()`, and bind whole-pixel coordinates. Whoever adds a component tied to an entity removes it when that entity is destroyed.
- Register DOM listeners with `{ signal: this.signal }` so they are removed on dispose.
- The overlay has `pointer-events: none`; only interactive elements opt back in with `pointer-events: auto`.
- Style each component with a co-located CSS module; global HUD styles go in `src/ui/ui.css`.

## Assets

Register runtime assets in the `ASSETS` object in `LoaderManager.ts`; this is also the source of the `ModelId`, `TextureId`, and `SoundId` types. Keep asset URLs relative (for example `models/tree.glb`) so non-root Vite base paths continue to work.

- Use `SRGBColorSpace` for color/albedo/emissive textures.
- Leave normal, roughness, ambient-occlusion, and height maps in a linear/no-color space.
- Use `LoaderManager.instantiate()` instead of attaching the cached model directly. Pass a node name to clone a single named node of a multi-object file (for example the tools in `tools.glb`).
- Sounds are `Howl` instances loaded with Web Audio (not `html5`), so they loop without gaps and `loadAll()` waits until they are decoded. Play them through `AudioManager`, keep the returned playback id to stop only that playback, and stop it in `onRemoved()`.
- Browsers block audio until the first user interaction; Howler queues `play()` calls and starts them when audio unlocks (first click, touch, or key press).
- When adding animated characters, verify clip names in the actual file; `CharacterAnimator` deliberately throws with the available names when a clip is missing.
- Do not rewrite, optimize, or duplicate the large binary asset collection unless the task specifically requires it.

## TypeScript and code style

- Use ESM imports, two-space indentation, double quotes, semicolons, and trailing commas in multiline constructs.
- Keep the configured strict checks clean, especially `noUnusedLocals` and `noUnusedParameters`.
- Use `import type` for type-only imports; `verbatimModuleSyntax` is enabled.
- `erasableSyntaxOnly` is enabled. Prefer unions, interfaces, plain objects, and classes over TypeScript syntax that emits runtime scaffolding such as enums or namespaces.
- Add explicit return types to public methods and lifecycle overrides, as the existing code does.
- Mark lifecycle implementations with `override`.
- Use `#private` fields for implementation details and `readonly` where references should not be reassigned.
- Prefer frame-rate-independent motion based on `delta` and exponential smoothing over frame-count-based movement.
- Use physical key codes (`KeyboardEvent.code`, such as `KeyW`) through `InputManager`. Mouse buttons use `MouseLeft`, `MouseMiddle`, and `MouseRight`, and only register when the press starts on the canvas.
- Everything that ends up in code is written in English, even when the conversation happens in Italian: identifiers, string ids, user-facing labels, comments, and commit messages. Some older comments are still in Italian; leave unrelated ones alone, but write new or rewritten comments in English.
- Keep comments focused on non-obvious ownership, coordinate-system, physics, or rendering decisions.

Do not relax `tsconfig.json` checks to make a change compile. Fix the underlying type or ownership issue.

## Decision records

When making a non-trivial architectural or design decision (new subsystem, state ownership, dependency choice, cross-cutting pattern), create or update `.claude/adr/<feature>.md` in the same change. Each record states the date, status, context, decision, rejected alternatives with their reasons, and consequences. Never delete superseded decisions: mark them as superseded, with the date and a link to the replacement.

## Validation checklist

For every code change:

1. Run `yarn build` and `yarn test`, and report any pre-existing failure separately from regressions.
2. Add or update unit tests for changed pure logic, and integration tests when modules interact (for example entities with Rapier).
3. If rendering, input, animation, camera, asset, or physics behavior changed, run `yarn dev` and smoke-test the affected path in a browser.
4. Also test with `?debug` when changing entities, Rapier integration, shadows, or GUI controls.
5. Check the browser console for asset-loading, WebGL, animation-clip, and disposal errors.
6. Exercise Vite hot reload when changing global managers or teardown logic.

Useful current controls are WASD for movement, left Shift for running, Space for jumping, 1/2/3 for selecting the pickaxe, axe, or torch, and holding the left mouse button or J to use the selected tool.

## Known baseline issues

`yarn build` and `yarn test` currently pass; a failure in either is a regression.

- `chunkSeed(x, z)` returns the same seed as `chunkSeed(-x, -z)` for many chunks (for example `(1, 1)` and `(-1, -1)`), so those chunks get the same layout. `src/entities/World/chunks.test.ts` records it as an expected failure (`it.fails`); remove `.fails` when the hash is fixed.