# Meadow Waltz

A cozy low-poly third-person exploration prototype built with Three.js, TypeScript, and Rapier.

Meadow Waltz is an early-stage browser game about wandering through an endless meadow with a backpack of simple tools. Daylight follows the player's real local time, a campfire marks the starting "home", and nothing rushes you. The design intent is described in [docs/game-vision.md](docs/game-vision.md).

## Current features

**Player**

- Third-person walking, running, turning, and jumping
- Animated GLB character with state-based animation transitions and a full-body tool-use animation
- Rapier character controller with gravity, ground collision, slopes, and autostep
- Three tools held in hand (pickaxe, axe, torch); the torch carries its own light
- CPU-simulated dirt particles kicked up by footsteps

**World**

- Endless meadow: the ground plane follows the player over a half-space collider
- Chunked low-poly vegetation drawn with `InstancedMesh` and placed with a seeded random generator
- Trees of several models scattered in the same chunks, each with its own collider and interaction
- Fog that hides the edge of the ground and chunks appearing
- An animated, flickering campfire with its own point light
- Screen-space wind streaks computed entirely in a shader

**Lighting**

- Day/night cycle driven by the real solar elevation at the player's local time, with coordinates taken from the reference city of their IANA time zone (no location permission needed)
- Directional light with a fixed direction and stabilized (texel-snapped) shadow mapping; it becomes a faint moonlight at night

**Interaction and HUD**

- Interaction system: the nearest target in front of the player is highlighted with an outline and shows a prompt (currently, trees shake when hit with the axe and fall after a few hits, leaving a stump and giving wood; felled trees stay felled when their chunk is reloaded and grow back after a configurable delay, 5 minutes by default)
- HTML/CSS HUD overlay: day-phase clock, tool bar with icons rendered from the 3D models, a resource counter that shows only what the player carries, and world-anchored interaction prompts

**Engine**

- Entity lifecycle with deferred removal and per-entity debug folders
- Clamped frame delta and a capped physics step for stable simulation after frame drops
- Background music, footsteps, and jump sound effects
- Optional debug GUI and Rapier wireframe rendering
- Hot-module-reload cleanup for rendering, physics, input, audio, UI, and debug state

## Tech stack

- [Three.js](https://threejs.org/) for rendering, animation, and scene management
- [Rapier](https://rapier.rs/) for physics and character movement
- [Howler.js](https://howlerjs.com/) for audio playback
- [lil-gui](https://lil-gui.georgealways.com/) for runtime debug controls
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/) for development and builds
- [Vitest](https://vitest.dev/) for unit and integration tests

The HUD uses vanilla TypeScript and CSS modules, with no UI framework.

## Getting started

The project uses Yarn Classic and includes a Yarn v1 lockfile.

```sh
yarn install
yarn dev
```

Open the local URL printed by Vite. The app is served under the base path `/projects/meadow/` (see [vite.config.ts](vite.config.ts)). Browser audio stays suspended until the first keyboard, mouse, or touch interaction.

To type-check, create, and preview a production build:

```sh
yarn build
yarn preview
```

To run the tests ([Vitest](https://vitest.dev/), in Node):

```sh
yarn test               # all tests, once
yarn test:unit          # unit tests only (src/**/__tests__/)
yarn test:integration   # integration tests only (tests/integration/)
```

`yarn build` (which runs `tsc` first, type-checking the tests too) and `yarn test` are the automated checks, followed by a manual smoke test in the browser.

## Controls

| Input | Action |
| --- | --- |
| `W`, `A`, `S`, `D` | Move |
| Left `Shift` | Run |
| `Space` | Jump |
| `1`, `2`, `3` | Select pickaxe, axe, or torch |
| Left mouse button or `J` (hold) | Use the selected tool |
| `E` | Interact (actions that need no tool) |

Keys are physical key codes, so they stay in the same position on any keyboard layout.

## Debug mode

Append `?debug` to the application URL:

```text
http://localhost:5173/projects/meadow/?debug
```

Debug mode enables the runtime GUI and Rapier wireframe rendering. The GUI exposes rendering statistics, audio controls, and per-entity folders for the player, sun and shadows, day/night cycle, campfire, wind, and physics debug view.

## Project structure

```text
src/
├── main.ts                 Application composition and startup/shutdown order
├── Engine.ts               Render loop, timing, camera, renderer
├── Entity.ts               Base entity lifecycle
├── EntityManager.ts        Scene attachment, updates, and deferred removal
├── LoaderManager.ts        Typed model, texture, and sound registry
├── PhysicsManager.ts       Rapier world lifecycle and stepping
├── InputManager.ts         Keyboard and mouse state
├── AudioManager.ts         Sound playback and debug controls
├── UIManager.ts            HUD layout slots, mounting, and per-frame bindings
├── DebugManager.ts         Debug GUI and rendering statistics
├── CharacterAnimator.ts    Animation clips and transitions
├── entities/
│   ├── Player/             Character movement, tools, and tool holder
│   ├── World/              Endless ground, instanced vegetation, chunked forest
│   ├── DayNightCycle/      Solar elevation, lighting curve, time zones
│   ├── WindStreaks/        Wind overlay and its shaders
│   ├── Campfire.ts
│   ├── FollowCamera.ts
│   ├── PhysicsDebug.ts
│   ├── Stump.ts
│   ├── Sun.ts
│   └── Tree.ts
├── interaction/            Interactable, InteractionManager, outline
├── particles/              ParticleEffect, ParticleSystem, InstancedParticles, FootDust
└── ui/                     HUD components (DayClock, ToolBar, ResourceCounter, InteractionPrompt)

public/
├── models/                 GLB assets (and some Blender sources)
├── textures/
└── audio/

tests/
└── integration/            Tests that exercise several modules together (e.g. Rapier)
                            (unit tests live in src/**/__tests__/, next to the module)

docs/                       Game design notes
.claude/adr/                Architecture decision records, one file per feature
```

Contributor and agent guidelines (lifecycle rules, resource ownership, code style) are in [AGENTS.md](AGENTS.md).

## Project status

Meadow Waltz is a gameplay and engine prototype rather than a complete game. Movement, lighting, physics, particles, interaction, and the HUD are in place; what tools actually do to the world (harvesting, mining, collecting) is the next open area.

## Assets and licensing

All assets were downloaded from [OpenGameArt](https://opengameart.org/), with the models created by [Quaternius](https://quaternius.com/) or directly generated by Claude Desktop (Blender's MCP). The Quaternius' ones are released under the [CC0 license](https://creativecommons.org/publicdomain/zero/1.0/) and are free to use in both personal and commercial projects.
