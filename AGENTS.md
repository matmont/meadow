# AGENTS.md

## Project overview

This is a small browser-based Three.js playground/game built with TypeScript and Vite. Rapier provides physics, howler.js provides audio, `lil-gui` provides opt-in debug controls, and models/textures/sounds are served as static assets from `public/`.

There is no application framework, test runner, linter, or formatter configured. Keep changes focused and follow the style of the surrounding TypeScript.

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
- `public/`: source assets. URLs registered in `LoaderManager` are relative to this directory through `import.meta.env.BASE_URL`.
- `dist/`: generated Vite output; it is ignored and must not be edited by hand.

## Setup and commands

Use Yarn Classic because the repository contains a v1 `yarn.lock`.

```sh
yarn install
yarn dev
yarn build
yarn preview
```

- `yarn dev` starts the Vite development server.
- Add `?debug` to the page URL to enable `lil-gui` and the Rapier wireframe debug entity.
- `yarn build` is the primary automated check: it runs `tsc` first, then creates the production bundle.
- There are currently no automated tests. For behavior changes, perform a browser smoke test as well as the build.

Do not add a second lockfile or silently switch package managers.

## Architecture and lifecycle rules

Startup order matters. `main.ts` must load assets, initialize Rapier, input, and audio (`AudioManager.init()` reads loaded sounds to build its debug folder) before constructing entities that read `LoaderManager` or `PhysicsManager`. Preserve the matching HMR cleanup for `Engine`, input, physics, debug state, and audio (otherwise looping sounds keep playing and stack up after each reload). Dispose audio before `DebugManager`, because it destroys its own folder in the debug GUI.

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

The frame loop currently updates entities, steps Rapier, and then renders. Consider that ordering before changing physics synchronization. Clamp or otherwise protect simulation code from unusually large frame deltas, following `PhysicsManager.step()` where applicable. Avoid needless allocations in per-frame `update()` methods; reusable vectors/quaternions are kept as fields throughout the codebase.

## Assets

Register runtime assets in the `ASSETS` object in `LoaderManager.ts`; this is also the source of the `ModelId`, `TextureId`, and `SoundId` types. Keep asset URLs relative (for example `models/tree.glb`) so non-root Vite base paths continue to work.

- Use `SRGBColorSpace` for color/albedo/emissive textures.
- Leave normal, roughness, ambient-occlusion, and height maps in a linear/no-color space.
- Use `LoaderManager.instantiate()` instead of attaching the cached model directly.
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
- Use physical key codes (`KeyboardEvent.code`, such as `KeyW`) through `InputManager`.
- Keep comments focused on non-obvious ownership, coordinate-system, physics, or rendering decisions. Existing comments use both English and Italian; match nearby code rather than translating unrelated comments.

Do not relax `tsconfig.json` checks to make a change compile. Fix the underlying type or ownership issue.

## Validation checklist

For every code change:

1. Run `yarn build` and report any pre-existing failure separately from regressions.
2. If rendering, input, animation, camera, asset, or physics behavior changed, run `yarn dev` and smoke-test the affected path in a browser.
3. Also test with `?debug` when changing entities, Rapier integration, shadows, or GUI controls.
4. Check the browser console for asset-loading, WebGL, animation-clip, and disposal errors.
5. Exercise Vite hot reload when changing global managers or teardown logic.

Useful current controls are WASD for movement and left Shift for running.

## Known baseline issues

`yarn build` currently passes; a failing build is a regression.
